/*! Squid Core API V2.0 */
(function (root, squid_api, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD.
        define(['jquery', 'backbone'], factory);
    } else {
        // Browser globals
        root[squid_api] = factory(root.$, root.Backbone);
    }
    // just make sure console.log will not crash
    if (!root.console) {
        root.console = {
            log : function() {}
        };
    }
}(this, "squid_api", function ($, Backbone) {

    // Squid API definition
    var squid_api = {
        debug : null,
        version : "2.1.0",
        apiURL: null,
        loginURL : null,
        timeoutMillis : null,
        customerId: null,
        projectId: null,
        domainId: null,
        clientId: null,
        fakeServer: null,
        defaultShortcut: null,
        defaultConfig: null,
        swaggerURL: null,
        apiSchema: null,

        // declare some namespaces
        model: {},
        view: {},
        collection: {},
        controller: {},

        setApiURL: function(a1) {
            if (a1 && a1[a1.length - 1] == "/") {
                a1 = a1.substring(0, a1.length - 1);
            }
            this.apiURL = a1;
            console.log("apiURL : "+this.apiURL);
            return this;
        },

        setTimeoutMillis: function(t) {
            this.timeoutMillis = t;
            return this;
        },

        /**
         * Compute an AnalysisJob or a FacetJob.
         * @return a Promise
         */
        compute : function(job, filters) {
            if (this.model.AnalysisJob && this.model.FiltersJob) {
                if (job instanceof this.model.FiltersJob) {
                    return this.controller.facetjob.compute(job, filters);
                } else {
                    return this.controller.analysisjob.compute(job, filters);
                }
            } else {
                throw Error("Cannot compute Job as dependencies are not loaded");
            }

        },

        utils: {

            mergeAttributes : function(obj1, obj2) {
                var obj = {};
                if (obj1) {
                    for (var att1 in obj1) {
                        obj[att1] = obj1[att1];
                    }
                }
                if (obj2) {
                    for (var att2 in obj2) {
                        obj[att2] = obj2[att2];
                    }
                }
                return obj;
            },

            getProjectDomains : function() {
                var dfd = new $.Deferred();
                var domains = new squid_api.model.DomainCollection();
                domains.parentId = {"projectId":squid_api.model.config.get("project")};
                domains.fetch({
                    success: function(domains) {
                        dfd.resolve(domains);
                    },
                    error: function() {
                        dfd.reject();
                    }
                });
                return dfd.promise();
            },

            /*
             * Returns an array of domain relations based on left/right id
             */
            getDomainRelations : function(relations, oid) {
                var models = [];
                if (relations && oid) {
                    for (i=0; i<relations.length; i++) {
                        if (relations[i].get("leftId") && relations[i].get("rightId")) {
                            if (relations[i].get("leftId").domainId == oid || relations[i].get("rightId").domainId == oid) {
                                models.push(relations[i]);
                            }
                        }
                    }
                }
                return models;
            },

            fetchModel : function(modelName) {
                var dfd = new $.Deferred();
                var name = modelName.toLowerCase();
                var model = new squid_api.model[name.charAt(0).toUpperCase() + name.slice(1) + "Model"]();
                model.set("id", {
                    projectId : squid_api.model.config.get("project"),
                    domainId : squid_api.model.config.get("domain")
                });
                model.fetch({
                    success: function(data) {
                        dfd.resolve(data);
                    },
                    error: function() {
                        dfd.reject();
                    }
                });
                return dfd.promise();
            },

            getDomainMetrics : function() {
                var dfd = new $.Deferred();
                var domain = new squid_api.model.DomainModel();
                var metrics = new squid_api.model.MetricCollection();
                var currentProject = squid_api.model.config.get("project");
                var currentDomain = squid_api.model.config.get("domain");
                /*
                    if the Domain is still dynamic, display all metrics
                    if the Domain is not dynamic, only display concrete metrics
                */
                if (currentDomain) {
                    domain.set("id", {"projectId" : currentProject, domainId : currentDomain});
                    metrics.parentId = {projectId : currentProject, domainId : currentDomain};
                    domain.fetch({
                        success: function(domain) {
                            metrics.fetch({
                                success: function(metrics) {
                                    if (domain.get("dynamic") === false) {
                                        metrics.set(metrics.where({dynamic: false}));
                                    }
                                    dfd.resolve(metrics);
                                },
                                error: function() {
                                    dfd.reject();
                                }
                            });
                        },
                        error: function() {
                            dfd.reject();
                        }
                    });
                }
                return dfd.promise();
            },

            /*
             * Get a parameter value from the current location url
             */
            getParamValue: function(name, defaultValue) {
                var uri = new URI(window.location.href);
                var value;
                if (uri.hasQuery(name) === true) {
                    value = uri.search(true)[name];
                } else {
                    value = defaultValue;
                }
                return value;
            },

            clearParam : function(name) {
                var uri = new URI(window.location.href);
                uri.removeQuery(name);
            },

            /**
             * Write a cookie.
             * @param name cookie name
             * @param dom cookie domain
             * @param exp cookie expiration delay in minutes
             * @param v cookie value
             */
            writeCookie: function(name, dom, exp, v) {
                var d = null;
                if (exp) {
                    d = new Date();
                    d.setTime(d.getTime() + (exp * 60 * 1000));
                }
                var nc = name + "=" + escape(v) + ((d === null) ? "" : ";expires=" + d.toUTCString()) + "; path=/;";
                if (dom) {
                    nc = nc + " domain=" + dom;
                }
                document.cookie = nc;
            },

            readCookie: function(name) {
                var c = null,
                dc = document.cookie;
                if (dc.length > 0) {
                    var cs = dc.indexOf(name + "=");
                    if (cs != -1) {
                        cs = cs + name.length + 1;
                        var ce = dc.indexOf(";", cs);
                        if (ce == -1) {
                            ce = dc.length;
                        }
                        c = unescape(dc.substring(cs, ce));
                    }
                }
                return c;
            },

            clearLogin : function() {
                var cookiePrefix = "sq-token";
                squid_api.utils.writeCookie(cookiePrefix + "_" + squid_api.customerId, "", -100000, null);
                squid_api.utils.writeCookie(cookiePrefix, "", -100000, null);
                squid_api.model.login.set({
                    accessToken: null,
                    login: null
                });
            },

            /**
             * Deep find an object having a given property value and objectType in a JSON object.
             */
            find : function(theObject, key, value, objectType) {
                var result = null, i;
                if (theObject instanceof Array) {
                    for (i = 0; i < theObject.length; i++) {
                        result = this.find(theObject[i], key,
                                value, objectType);
                        if (result) {
                            break;
                        }
                    }
                } else {
                    for ( var prop in theObject) {
                        if (prop == key) {
                            if (theObject[prop] == value) {
                                if (!objectType || (objectType == theObject.objectType)) {
                                    return theObject;
                                }
                            }
                        }
                        if ((theObject[prop] instanceof Object) || (theObject[prop] instanceof Array)) {
                            result = this.find(theObject[prop], key, value, objectType);
                            if (result) {
                                break;
                            }
                        }
                    }
                }
                return result;
            },

            /**
             * Streamline a selection (get rid of the facet items).
             */
            buildCleanSelection : function(selectionOpt) {
                var selection = {
                        "facets" : []
                };
                if (selectionOpt) {
                    var facets = selectionOpt.facets;
                    if (facets) {
                        for (var is = 0; is < facets.length; is++) {
                            var facet = facets[is];
                            if (facet.selectedItems && (facet.selectedItems.length>0)) {
                                var newFacet = {
                                        "selectedItems" : facet.selectedItems,
                                        "dimension" : facet.dimension,
                                        "id" : facet.id
                                };
                                selection.facets.push(newFacet);
                            }
                        }
                    }
                }
                return selection;
            },
        },

        setProjectId : function(oid) {
            if (oid) {
                var me = this;
                var dfd = new $.Deferred();
                this.projectId = oid;
                this.model.project.set({"id" : {"customerId" : this.customerId, "projectId" : oid}}, {"silent" : true});
                this.model.project.addParameter("deepread", "1");
                this.model.project.fetch({
                    success : function(model, response, options) {
                        console.log("project fetched : "+model.get("name"));
                        dfd.resolve();
                    },
                    error : function(model, response, options) {
                        console.error("project fetch failed");
                        dfd.reject();
                    }
                });
                return dfd.promise();
            } else {
                // reset
                var atts = this.model.project.attributes;
                for (var att in atts) {
                    this.model.project.set(att, null);
                }
            }
        },

        /**
         * Save the current State model
         * @param an array of extra config elements
         */
        saveState : function(config) {
            var me = this;
            var attributes = {
                    "config" : me.model.config.attributes
            };

            // add the extra config
            if (config) {
                for (var i=0; i<config.length; i++) {
                    var c = config[i];
                    for (var prop in c) {
                        attributes.config[prop] = c[prop];
                    }
                }
            }

            // check if save is required
            if ((!me.model.state) || (!_.isEqual(me.model.state.get("config"), attributes.config))) {
                var stateModel = new me.model.StateModel();
                stateModel.set({
                    "id" : {
                        "customerId" : this.customerId,
                        "stateId" : null
                     }
                });

                // save
                stateModel.save(attributes, {
                    success : function(model, response, options) {
                        var oid = model.get("oid");
                        console.log("state saved : "+oid);
                        // keep for comparison when saved again
                        me.model.state = model;

                        // save in browser history
                        if (window.history) {
                            var uri = new URI(window.location.href);
                            uri.setQuery("state", oid);
                            window.history.pushState(model.toJSON(), "", uri);
                        }
                    },
                    error : function(model, response, options) {
                        console.error("state save failed");
                    }
                });
            }
        },

        refreshDb: function(project) {
            if (project) {
                var request = $.ajax({
                    type: "GET",
                    url: squid_api.apiURL + "/projects/" + project.get("id").projectId + "/refreshDatabase" + "?access_token=" + squid_api.model.login.get("accessToken"),
                    dataType: 'json',
                    contentType: 'application/json'
                });

                request.done(function() {
                    squid_api.model.status.set("message", "database successfully refreshed");
                });

                request.fail(function() {
                    squid_api.model.status.set("message", "database refresh failed");
                    squid_api.model.status.set("error", "error");
                });
            }
        },

        validateDB: function(projectId, url,username,password) {
                var request = $.ajax({
                    type: "GET",
                    url: squid_api.apiURL + "/connections/validate" + "?access_token="+squid_api.model.login.get("accessToken")+"&projectId="+projectId+"&url="+url+"&username="+ username +"&password=" + password,
                    dataType: 'json',
                    contentType: 'application/json',
                    error: function(xhr, textStatus, error){
                        squid_api.model.status.set({"message":"Invalid Login/password for JDBC access"}, {silent:true});
                        squid_api.model.status.set("error",true);
                        return 500;
                    },
                    statusCode: {
                        500: function() {
                            squid_api.model.status.set({"message":"Invalid Login/password for JDBC access"}, {silent:true});
                            squid_api.model.status.set("error",true);
                            return 500;
                        },
                        404: function() {
                            squid_api.model.status.set({"message":"Unable to login"}, {silent:true});
                            squid_api.model.status.set("error",true);
                            return 404;
                        }
                    }

                });

                request.done(function() {
                    squid_api.model.status.set({"message":"Login for jdbc access validated"}, {silent:true});
                    squid_api.model.status.set("error",true);
                    return 200;
                });

                request.fail(function() {
                    squid_api.model.status.set({"message":"Invalid Login/password for JDBC access"}, {silent:true});
                    squid_api.model.status.set("error",true);
                    return 404;
                });
        },

        setStateId : function(dfd, stateId, baseConfig, forcedConfig) {
            var me = this;
            dfd = dfd || (new $.Deferred());
            var stateModel = new squid_api.model.StateModel();
            stateModel.set({
                "id" : {
                    "customerId" : this.customerId,
                    "stateId" : stateId
                }
            });
            stateModel.fetch({
                success : function(model, response, options) {
                    var oid = model.get("oid");
                    // keep for comparison when saved again
                    me.model.state = model;
                    var config = model.get("config");
                    config = me.utils.mergeAttributes(baseConfig,config);
                    if (_.isFunction(forcedConfig)) {
                        config = forcedConfig(config);
                    } else {
                        config = me.utils.mergeAttributes(config, forcedConfig);
                    }
                    me.model.config.set(config);
                },
                error : function(model, response, options) {
                    // state fetch failed
                    dfd.reject();
                }
            });
            return dfd.promise();
        },

        setShortcutId : function(shortcutId, baseConfig, forcedConfig) {
            var me = this;
            var dfd = new $.Deferred();
            if (shortcutId) {
                var shortcutModel = new squid_api.model.ShortcutModel();
                shortcutModel.set({
                    "id" : {
                        "customerId" : this.customerId,
                        "shortcutId" : shortcutId
                    }
                });
                shortcutModel.fetch({
                    success : function(model, response, options) {
                        console.log("shortcut fetched : "+model.get("name"));
                        me.model.status.set("shortcut", model);
                        // get the associated state
                        me.setStateId(dfd, model.get("stateId"), baseConfig, forcedConfig);
                    },
                    error : function(model, response, options) {
                        console.error("shortcut fetch failed : "+shortcutId);
                        dfd.reject();
                    }
                });
            } else {
                me.model.config.set(baseConfig);
            }
            return dfd.promise();
        },

        /**
         * Setup the API default settings.
         * @param a config json object
         */
        setup : function(args) {
            var me = this, api, apiUrl, loginUrl, timeoutMillis;

            args = args || {};
            args.customerId = args.customerId || null;
            args.clientId = args.clientId || null;
            args.projectId = args.projectId || null;
            args.domainId = args.domainId || null;
            args.relationId = args.relationId || null;
            args.selection = args.selection || null;
            this.defaultShortcut = args.defaultShortcut || null;
            this.defaultConfig = args.config || {};
            apiUrl = args.apiUrl || null;

            this.debug = squid_api.utils.getParamValue("debug", null);
            if (!this.debug) {
                this.debug = args.debug;
            }

            this.customerId = squid_api.utils.getParamValue("customerId", null);
            if (!this.customerId) {
                this.customerId = args.customerId;
            }

            this.clientId = squid_api.utils.getParamValue("clientId", null);
            if (!this.clientId) {
                this.clientId = args.clientId;
            }

            var domainId = squid_api.utils.getParamValue("domainId",null);
            if (!domainId) {
                domainId = args.domainId;
            } else {
                this.defaultConfig.domain = domainId;
            }
            this.domainId = domainId;
            this.model.domain = new squid_api.model.DomainModel();

            var projectId = squid_api.utils.getParamValue("projectId",null);
            if (!projectId) {
                projectId = args.projectId;
            } else {
                this.defaultConfig.project = projectId;
            }
            this.projectId = projectId;
            this.model.project = new squid_api.model.ProjectModel();

            if (args.browsers) {
                this.browsers = args.browsers;
            }

            // config handling

            var configModel = new Backbone.Model();
            this.model.config = configModel;

            configModel.on("change:project", function(model) {
                me.setProjectId(model.get("project"));
            });

            // selection

            var defaultSelection = null;
            if (args.selection) {
                if (args.selection.date) {
                    // setup default filters
                    defaultSelection = {
                            "facets" : [ {
                                "dimension" : {
                                    "id" : {
                                        "projectId" : this.projectId,
                                        "domainId" : this.domainId,
                                        "dimensionId" : args.selection.date.dimensionId
                                    }
                                },
                                "selectedItems" : [ {
                                    "type" : "i",
                                    "lowerBound" : (args.selection.date.lowerBound + "T00:00:00.000Z"),
                                    "upperBound" : (args.selection.date.upperBound + "T00:00:00.000Z")
                                } ]
                            } ]
                    };
                }
            }

            var filters = new squid_api.controller.facetjob.FiltersModel();
            filters.set("selection" , defaultSelection);
            squid_api.model.filters = filters;

            // init the api server URL
            api = squid_api.utils.getParamValue("api","release");
            version = squid_api.utils.getParamValue("version","v4.2");

            apiUrl = squid_api.utils.getParamValue("apiUrl", apiUrl);
            if (!apiUrl) {
                console.error("Please provide an API endpoint URL");
            } else {
                if (apiUrl.indexOf("://") < 0) {
                    apiUrl = "https://"+apiUrl;
                }
                this.setApiURL(apiUrl + "/"+api+"/"+version+"/rs");
                this.swaggerURL = apiUrl + "/"+api+"/"+version+"/swagger.json";

                // init the Login URL
                loginUrl = squid_api.utils.getParamValue("loginUrl",apiUrl);
                loginUrl += "/"+api+"/auth/oauth?response_type=code";
                if (this.clientId) {
                    loginUrl += "&client_id=" + this.clientId;
                }
                if (this.customerId) {
                    loginUrl += "&customerId=" + this.customerId;
                }
                this.loginURL = loginUrl;
                console.log("loginURL : "+this.loginURL);
            }
            

            // init the timout
            timeoutMillis = args.timeoutMillis;
            if (!timeoutMillis) {
                timeoutMillis = 10*1000; // 10 Sec.
            }
            this.setTimeoutMillis(timeoutMillis);

            return this;
        },

        /**
         * Init the API by checking if an AccessToken is present in the url and updating the loginModel accordingly.
         * @param a config json object (if present will call the setup method).
         */
        init: function(args) {
            var browserOK = false;

            if (this.browsers) {
                // check browser compatibility
                for (var browserIdx = 0; browserIdx < this.browsers.length; browserIdx++) {
                    var browser = this.browsers[browserIdx];
                    if (navigator.userAgent.indexOf(browser) > 0) {
                        browserOK = true;
                    }
                }
            } else {
                browserOK = true;
            }
            if (browserOK) {
                if (!this.apiURL) {
                    this.model.status
                    .set(
                            "error",
                            {
                                "dismissible" : false,
                                "message" : "Please provide an API endpoint URL"
                            });
                } else {
                    // continue init process
                    this.initStep1(args);
                }
            } else {
                console.error("Unsupported browser : "+navigator.userAgent);
                this.model.status
                .set(
                        'error',
                        {
                            "dismissible" : false,
                            "message" : "Sorry, you're using an unsupported browser. Supported browsers are Chrome, Firefox, Safari"
                        });
            }
        },

        initStep1: function(args) {
            var me = this, loginModel;

            if (args) {
                this.setup(args);
                loginModel = args.loginModel;
            }

            // handle session expiration
            this.model.status.on('change:error', function(model) {
                var err = model.get("error");
                if (err) {
                    var status = err.status;
                    if (status == 401) {
                        me.utils.clearLogin();
                    }
                }
            });

            if (!loginModel) {
                loginModel = this.model.login;
            }

            // check for login performed
            loginModel.on('change:login', function(model) {
                if (model.get("login")) {
                    // login ok
                    // perform init chain
                    var state = squid_api.utils.getParamValue("state",null);
                    var shortcut = squid_api.utils.getParamValue("shortcut", me.defaultShortcut);
                    if (state) {
                        var dfd = me.setStateId(null, state, me.defaultConfig);
                        dfd.fail(function() {
                            me.setShortcutId(shortcut, me.defaultConfig);
                        });
                    } else {
                        me.setShortcutId(shortcut, me.defaultConfig);
                    }
                }
            });

            // set the access_token (to start the login model update)
            var code = squid_api.utils.getParamValue("code", null);
            if (code) {
                loginModel.setAccessCode(code);
            } else {
                var token = squid_api.utils.getParamValue("access_token", null);
                loginModel.setAccessToken(token);
            }
        },


        /**
         * Get the API's (Swagger) Schema.
         * Example usage :
         * squid_api.getSchema().done(function(data){console.log("schema :"+data);});
         * @param forceRefresh if true schema will be fetched
         * @return a Promise wrapping a schema json object or null if fetch failed.
         */
        getSchema : function(forceRefresh) {
            var dfd;
            var me = this;
            if ((!me.apiSchema) || (forceRefresh === true)) {
                // not in cache, execute the query
                return $.ajax({
                    url : me.swaggerURL
                }).done(null, function (xhr, status, error) {
                    // put in cache
                    me.apiSchema = xhr;
                });
            } else {
                // already in cache
                dfd = $.Deferred();
                // just resolve and return a promise
                return dfd.resolve(me.apiSchema).promise();
            }
        }
    };

    squid_api.model.BaseModel = Backbone.Model.extend({

        addParameter : function(name, value) {
            if ((typeof value !== 'undefined') && (value !== null)) {
                this.parameters.push({"name" : name, "value" : value});
            }
        },

        getParameter : function(name) {
            var i=0, param;
            if (this.parameters) {
                while (i<this.parameters.length) {
                    param = this.parameters[i];
                    if (param.name == name) {
                        return param.value;
                    }
                    i++;
                }
            }
            return null;
        },


        setParameter : function(name, value) {
            var index = null;
            for (var i=0; i<this.parameters.length; i++) {
                if (this.parameters[i].name === name) {
                    index = i;
                    break;
                }
            }
            if (index !== null) {
                if ((typeof value === 'undefined') || (value === null)) {
                    // unset
                    this.parameters.splice(index,1);
                } else {
                    // set
                    this.parameters[index].value = value;
                }
            } else {
                this.parameters.push({"name" : name, "value" : value});
            }
        },

        initialize: function(attributes, options) {
            if (options) {
                this.parameters = options.parameters;
                this.statusModel = options.statusModel;
            }
        },

        constructor: function() {
            // Define some attributes off of the prototype chain
            this.parameters = [];
            this.statusModel = null;

            // Call the original constructor
            Backbone.Model.apply(this, arguments);
        },

        idAttribute : "oid",

        baseRoot: function() {
            return squid_api.apiURL;
        },
        urlRoot: function() {
            return this.baseRoot();
        },
        url: function() {
            var url = this.urlRoot();
            if (!this.hasParam("timeout")) {
                if (typeof this.timeoutMillis === 'undefined' ) {
                    url = this.addParam(url, "timeout",squid_api.timeoutMillis);
                } else {
                    if (this.timeoutMillis !== null) {
                        url = this.addParam(url, "timeout",this.timeoutMillis());
                    }
                }
            }
            if (!this.hasParam("access_token")) {
                url = this.addParam(url, "access_token",squid_api.model.login.get("accessToken"));
            }
            // add parameters
            if (this.parameters) {
                for (var i=0; i<this.parameters.length; i++) {
                    var param = this.parameters[i];
                    if (param.value !== null) {
                        url = this.addParam(url, param.name, param.value);
                    }
                }
            }
            return url;
        },
        error: null,
        hasParam: function(name) {
            var hasParam = false, i=0;
            if (this.parameters) {
                while (i<this.parameters.length && (!hasParam)) {
                    var param = this.parameters[i];
                    if (param.name == name) {
                        hasParam = true;
                    }
                    i++;
                }
            }

            return hasParam;
        },
        addParam : function(url, name, value) {
            if (value) {
                var delim;
                if (url.indexOf("?")<0) {
                    delim = "?";
                } else {
                    delim = "&";
                }
                url += delim + name + "=" + encodeURIComponent(value);
            }
            return url;
        },

        optionsFilter : function(options) {
            // success
            var success, me = this;
            if (!options) {
                options = {success : null, error : null};
            } else {
                success = options.success;
            }
            options.success =  function(model, response, options) {
                if (me.statusModel) {
                    me.statusModel.pullTask(model);
                }
                // normal behavior
                if (success) {
                    success.call(this, model, response, options);
                }
            };

            var error;
            error = options.error;
            options.error =  function(model, response, options) {
                if (me.statusModel) {
                    me.statusModel.set("error", response);
                    me.statusModel.pullTask(model);
                }
                if (!response.status) {
                    squid_api.model.status.set("error" , {"message" : "Unable to reach API Services"});
                }
                if (error) {
                    // normal behavior
                    error.call(this.model, response, options);
                }
            };
            return options;
        },

        /*
         * Overriding fetch to handle token expiration
         */
        fetch : function(options) {
            if (this.statusModel) {
                this.statusModel.pushTask(this);
            }
            return Backbone.Model.prototype.fetch.call(this, this.optionsFilter(options));
        },

        /*
         * Overriding save to handle token expiration
         */
        save : function(attributes, options) {
            if (this.statusModel) {
                this.statusModel.pushTask(this);
            }
            return Backbone.Model.prototype.save.call(this, attributes, this.optionsFilter(options));
        }

    });

    squid_api.model.BaseCollection = Backbone.Collection.extend({
        parentId : null,

        parameters : [],

        addParameter : function(name, value) {
            this.parameters.push({"name" : name, "value" : value});
        },

        initialize : function(model, options) {
            if (options) {
                this.parentId = options.parentId;
                this.parameters = options.parameters;
            }
        },
        baseRoot: function() {
            return squid_api.apiURL;
        },
        urlRoot: function() {
            return this.baseRoot();
        },

        url: function() {
            var url = this.urlRoot();
            if (typeof this.timeoutMillis === 'undefined' ) {
                url = this.addParam(url, "timeout",squid_api.timeoutMillis);
            } else {
                if (this.timeoutMillis !== null) {
                    url = this.addParam(url, "timeout",this.timeoutMillis());
                }
            }
            url = this.addParam(url, "access_token",squid_api.model.login.get("accessToken"));
            // add parameters
            if (this.parameters) {
                for (var i=0; i<this.parameters.length; i++) {
                    var param = this.parameters[i];
                    url = this.addParam(url, param.name, param.value);
                }
            }
            return url;
        },

        error: null,
        addParam : function(url, name, value) {
            if (value) {
                var delim;
                if (url.indexOf("?")<0) {
                    delim = "?";
                } else {
                    delim = "&";
                }
                url += delim + name + "=" + value;
            }
            return url;
        }
    });

    squid_api.model.TokenModel = squid_api.model.BaseModel.extend({
        urlRoot: function() {
            return this.baseRoot() + "/tokeninfo";
        }
    });

    squid_api.model.LoginModel = squid_api.model.BaseModel.extend({

        accessToken: null,

        login: null,

        resetPassword: null,

        urlRoot: function() {
            return this.baseRoot() + "/user";
        },

        /**
         * Login the user using an access_token
         */
        setAccessCode: function(code, cookieExpiration) {
            var me = this;

            // remove from browser history
            if (window.history) {
                var uri = new URI(window.location.href);
                uri.removeQuery("code");
                window.history.pushState(code, "", uri);
            }

            // set the access token and refresh data
            var request = $.ajax({
                type: "POST",
                url: squid_api.apiURL + "/token",
                dataType: 'json',
                data: {"grant_type" : "authorization_code", "code": code, "client_id" : squid_api.clientId, "redirect_uri" : null}
            });

            request.fail(function(jqXHR) {
                me.setAccessToken(null, cookieExpiration);
            });

            request.done(function(data) {
                var token = data.oid;
                me.setAccessToken(token, cookieExpiration);
            });

        },

        /**
         * Login the user using an access_token
         */
        setAccessToken: function(token, cookieExpiration) {
            var cookiePrefix = "sq-token",cookie, me = this;

            if (!cookieExpiration) {
                cookieExpiration = 120; // 2 hours
            }

            if (squid_api.customerId) {
                cookie = cookiePrefix + "_" + squid_api.customerId;
            }
            else {
                cookie = cookiePrefix;
            }
            if (!token) {
                // search in a cookie
                token = squid_api.utils.readCookie(cookie);
            }

            if (!token) {
                squid_api.model.login.set("login", null);
            } else {
                this.set("accessToken", token);

                // fetch the token info from server
                var tokenModel = new squid_api.model.TokenModel({
                    "token": token
                });

                tokenModel.on("change:customerId", function(model) {
                    // set the customerId
                    squid_api.customerId = model.get("customerId");

                    // verify the clientId
                    if (model.get("clientId") != this.clientId) {
                        console.log("WARN : the Token used doesn't match you application's ClientId");
                    }

                    if ((token) && (typeof token != "undefined")) {
                        // write in a customer cookie
                        squid_api.utils.writeCookie(cookiePrefix + "_" + squid_api.customerId, "", cookieExpiration, token);
                        // write in a global cookie
                        squid_api.utils.writeCookie(cookiePrefix, "", cookieExpiration, token);
                    }

                    // update login model from server
                    squid_api.model.login.fetch().then(function() {
                        // fetch the customer
                        squid_api.model.customer.fetch()
                        .done(function(customer) {
                            console.log("customer fetched : "+customer.name);
                        })
                        .fail(function() {
                            console.log("customer fetched failed");
                        });
                    });
                });

                tokenModel.fetch({
                    error: function(model, response, options) {
                        if (model.status ===  401) {
                            squid_api.model.login.set("login", null);
                        } else {
                            squid_api.model.login.set("error", response);
                            squid_api.model.login.set("login", "error");
                        }
                    }
                });
            }


        },

        /**
         * Logout the current user
         */
        logout: function() {
            var me = this;
            // set the access token and refresh data
            var request = $.ajax({
                type: "GET",
                url: squid_api.apiURL + "/logout?access_token=" + this.get("accessToken"),
                dataType: 'json',
                contentType: 'application/json'
            });

            request.done(function(jsonData) {
                squid_api.utils.clearLogin();
            });

            request.fail(function(jqXHR, textStatus, errorThrown) {
                squid_api.model.status.set("message", "logout failed");
                squid_api.model.status.set("error", "error");
            });
        }

    });

    squid_api.model.login = new squid_api.model.LoginModel();

    // user model
    squid_api.model.UserModel = squid_api.model.BaseModel.extend({

        accessToken: null,

        login: null,

        email: null,

        groups: null,

        objectType: "User",

        password: null,

        wsName: null,

        error: "",

        url: function() {
            return this.baseRoot() + this.wsName + "?access_token=" + this.accessToken; // get user
        }

    });
    squid_api.model.userModel = new squid_api.model.UserModel();


    // Status Model
    squid_api.model.StatusModel = squid_api.model.BaseModel.extend({
        STATUS_RUNNING : "RUNNING",
        STATUS_DONE : "DONE",
        runningTasks : [],
        pushTask : function(task) {
            this.runningTasks.push(task);
            console.log("running tasks count : "+this.runningTasks.length);
            Backbone.Model.prototype.set.call(this,"status",this.STATUS_RUNNING);
        },
        pullTask : function(task) {
            var i = this.runningTasks.indexOf(task);
            if (i != -1) {
                this.runningTasks.splice(i, 1);
            }
            console.log("running tasks count : "+this.runningTasks.length);
            if (this.runningTasks.length === 0) {
                Backbone.Model.prototype.set.call(this,"status",this.STATUS_DONE);
            }
        }
    });
    squid_api.model.status = new squid_api.model.StatusModel({
        status : null,
        error : null,
        message : null,
        project : null,
        domain : null
    });

    /*
     * --- API Meta-Model objects Mapping to Backbone Models---
     */

    squid_api.model.CustomerInfoModel = squid_api.model.BaseModel.extend({
        urlRoot: function() {
            return this.baseRoot() + "/";
        }
    });

    squid_api.model.customer = new squid_api.model.CustomerInfoModel();

    squid_api.model.ClientModel = squid_api.model.BaseModel.extend({
        urlRoot: function() {
            return this.baseRoot() + "/clients/" + this.get("id").clientId;
        }
    });

    squid_api.model.StateModel = squid_api.model.BaseModel.extend({
        urlRoot: function() {
            return this.baseRoot() + "/states/" + (this.get("id").stateId || "");
        }
    });

    squid_api.model.ShortcutModel = squid_api.model.BaseModel.extend({
        urlRoot: function() {
            return this.baseRoot() + "/shortcuts/" + (this.get("id").shortcutId || "");
        }
    });

    squid_api.model.ShortcutCollection = squid_api.model.BaseCollection.extend({
        model : squid_api.model.ShortcutModel,
        urlRoot: function() {
            return this.baseRoot() + "/shortcuts";
        }
    });

    squid_api.model.ProjectModel = squid_api.model.BaseModel.extend({
        urlRoot: function() {
            return this.baseRoot() + "/projects/" + (this.get("id").projectId || "");
        },
        definition : "Project",
        ignoredAttributes : ['accessRights', 'config', 'relations', 'domains'],
        schema : {"id":{"title":" ","type":"Object","subSchema":{"projectId":{"options":[],"type":"Text","editorClass":"hidden"}},"editorClass":"hidden","fieldClass":"id"},"name":{"type":"Text","editorClass":"form-control","fieldClass":"name"},"dbUrl":{"title":"Database URL","type":"Text","editorClass":"form-control","position":1,"fieldClass":"dbUrl"},"dbUser":{"title":"Database User","type":"Text","editorClass":"form-control","position":2,"fieldClass":"dbUser"},"dbPassword":{"title":"Database Password","type":"Password","editorClass":"form-control","position":3,"fieldClass":"dbPassword"},"dbSchemas":{"title":"Database Schemas","type":"Checkboxes","editorClass":" ","options":[],"position":4,"fieldClass":"dbSchemas"}}
    });

    squid_api.model.ProjectCollection = squid_api.model.BaseCollection.extend({
        model : squid_api.model.ProjectModel,
        urlRoot: function() {
            return this.baseRoot() + "/projects";
        }
    });

    squid_api.model.UserModel = squid_api.model.BaseModel.extend({
        urlRoot: function() {
            return this.baseRoot() + "/users/" + this.get("id").userId;
        }
    });

    squid_api.model.GroupCollection = squid_api.model.BaseModel.extend({
        urlRoot: function() {
            return this.baseRoot() + "/usergroups";
        }
    });

    squid_api.model.UserCollection = squid_api.model.BaseCollection.extend({
        model : squid_api.model.UserModel,
        urlRoot: function() {
            return this.baseRoot() + "/users";
        }
    });

    squid_api.model.DomainModel = squid_api.model.ProjectModel.extend({
        urlRoot: function() {
            return squid_api.model.ProjectModel.prototype.urlRoot.apply(this, arguments) + "/domains/" + (this.get("id").domainId || "");
        },
        definition : "Domain",
        ignoredAttributes : ['accessRights', 'dimensions', 'metrics'],
        schema : {"id":{"title":" ","type":"Object","subSchema":{"projectId":{"options":[],"type":"Text","editorClass":"hidden"},"domainId":{"options":[],"type":"Text","editorClass":"form-control"}},"editorClass":"hidden","fieldClass":"id"},"name":{"type":"Text","editorClass":"form-control","fieldClass":"name"},"subject":{"type":"Object","title":"","subSchema":{"value":{"title":"Subject Value","type":"TextArea","editorClass":"form-control suggestion-box"}},"position":1,"fieldClass":"subject"}}
    });

    squid_api.model.DomainCollection = squid_api.model.BaseCollection.extend({
        model : squid_api.model.DomainModel,
        urlRoot: function() {
            return squid_api.model.ProjectCollection.prototype.urlRoot.apply(this, arguments) +"/"+ this.parentId.projectId + "/domains";
        }
    });

    squid_api.model.RelationModel = squid_api.model.ProjectModel.extend({
        urlRoot: function() {
            return squid_api.model.ProjectModel.prototype.urlRoot.apply(this, arguments) + "/relations/" + this.get("id").relationId;
        },
        definition: "Relation",
        ignoredAttributes : ['accessRights'],
        schema : {"id":{"title":" ","type":"Object","subSchema":{"projectId":{"options":[],"type":"Text","title":" ","editorClass":"hidden"},"relationId":{"options":[],"type":"Text","editorClass":"form-control"}},"editorClass":"hidden","fieldClass":"id"},"leftId":{"title":" ","type":"Object","subSchema":{"projectId":{"options":[],"type":"Text","title":" ","editorClass":"hidden"},"domainId":{"options":[],"type":"Select","editorClass":"form-control","title":"Left Domain"}},"fieldClass":"leftId"},"leftCardinality":{"type":"Select","editorClass":"form-control","options":["ZERO_OR_ONE","ONE","MANY"],"fieldClass":"leftCardinality"},"rightCardinality":{"type":"Select","editorClass":"form-control","options":["ZERO_OR_ONE","ONE","MANY"],"fieldClass":"rightCardinality"},"rightId":{"title":" ","type":"Object","subSchema":{"projectId":{"options":[],"type":"Text","title":" ","editorClass":"hidden"},"domainId":{"options":[],"type":"Select","editorClass":"form-control","title":"Right Domain"}},"fieldClass":"rightId"},"leftName":{"type":"Text","editorClass":"form-control","fieldClass":"leftName"},"rightName":{"type":"Text","editorClass":"form-control","fieldClass":"rightName"},"joinExpression":{"title":" ","type":"Object","subSchema":{"value":{"title":"Join Expression","type":"TextArea","editorClass":"form-control suggestion-box"}},"fieldClass":"joinExpression"}}
    });

    squid_api.model.RelationCollection = squid_api.model.BaseCollection.extend({
        model : squid_api.model.RelationModel,
        urlRoot: function() {
            return squid_api.model.ProjectCollection.prototype.urlRoot.apply(this, arguments) +"/"+ this.parentId.projectId + "/relations";
        }
    });

    squid_api.model.DimensionModel = squid_api.model.DomainModel.extend({
        urlRoot: function() {
            return squid_api.model.DomainModel.prototype.urlRoot.apply(this, arguments) + "/dimensions/" + (this.get("id").dimensionId || "");
        },
        definition: "Dimension",
        ignoredAttributes : ['options', 'accessRights', 'dynamic', 'attributes', 'valueType'],
        schema : {"id":{"title":" ","type":"Object","subSchema":{"projectId":{"options":[],"type":"Text","editorClass":"hidden"},"domainId":{"options":[],"type":"Text","editorClass":"form-control"},"dimensionId":{"options":[],"type":"Text","editorClass":"form-control"}},"editorClass":"hidden","fieldClass":"id"},"name":{"type":"Text","editorClass":"form-control","fieldClass":"name"},"type":{"type":"Checkboxes","editorClass":" ","options":[{"val":"CATEGORICAL","label":"Indexed"},{"val":"CONTINUOUS","label":"Period"}],"position":1,"fieldClass":"type"},"parentId":{"title":" ","type":"Object","subSchema":{"projectId":{"options":[],"type":"Text","editorClass":"hidden","fieldClass":"hidden"},"domainId":{"options":[],"type":"Text","editorClass":"form-control","fieldClass":"hidden"},"dimensionId":{"options":[],"type":"Text","editorClass":"form-control","title":"Parent Dimension"}},"position":2,"fieldClass":"parentId"},"expression":{"type":"Object",title:"","subSchema":{"value":{"type":"TextArea","editorClass":"form-control suggestion-box","title":"Expression Value"}},"position":3,"fieldClass":"expression"}}
    });

    squid_api.model.DimensionCollection = squid_api.model.BaseCollection.extend({
        model : squid_api.model.DimensionModel,
        urlRoot: function() {
            return squid_api.model.DomainCollection.prototype.urlRoot.apply(this, arguments) + "/" + this.parentId.domainId + "/dimensions";
        }
    });

    squid_api.model.MetricModel = squid_api.model.DomainModel.extend({
        urlRoot: function() {
            return squid_api.model.DomainModel.prototype.urlRoot.apply(this, arguments) + "/metrics/" + (this.get("id").metricId || "");
        },
        definition: "Metric",
        schema : {"id":{"title":" ","type":"Object","subSchema":{"projectId":{"options":[],"type":"Text","editorClass":"hidden"},"domainId":{"options":[],"type":"Text","editorClass":"form-control"},"metricId":{"options":[],"type":"Text","editorClass":"form-control"}},"editorClass":"hidden","fieldClass":"id"},"dynamic":{"type":"Text","editorClass":"form-control","fieldClass":"dynamic hidden"},"name":{"type":"Text","editorClass":"form-control","fieldClass":"name"},"expression":{"title":"","type":"Object","subSchema":{"value":{"title":"Expression Value","type":"TextArea","editorClass":"form-control suggestion-box"}},"position":1,"fieldClass":"expression"}}
    });

    squid_api.model.MetricCollection = squid_api.model.BaseCollection.extend({
        model : squid_api.model.MetricModel,
        urlRoot: function() {
            return squid_api.model.DomainCollection.prototype.urlRoot.apply(this, arguments) + "/" + this.parentId.domainId + "/metrics";
        }
    });

    return squid_api;
}));

/*! Squid Core API AnalysisJob Controller V2.0 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD.
        define(['Backbone', '_', 'squid_api'], factory);
    } else {
        factory(root.Backbone, _, root.squid_api);
    }
}(this, function (Backbone, _, squid_api) {
    
    // here we expose some models

    squid_api.model.ProjectAnalysisJob = squid_api.model.ProjectModel.extend({
            urlRoot: function() {
                var url = squid_api.model.ProjectModel.prototype.urlRoot.apply(this, arguments);
                url = url + "/analysisjobs/" + (this.get("id").analysisJobId ? this.get("id").analysisJobId : "");
                return url;
            },
            error: null,
            domains: null,
            dimensions: null,
            metrics: null,
            selection: null
        });

    squid_api.model.ProjectAnalysisJobResult = squid_api.model.ProjectAnalysisJob.extend({
            urlRoot: function() {
                return squid_api.model.ProjectAnalysisJob.prototype.urlRoot.apply(this, arguments) + "/results";
            },
            error: null
        });
    
    squid_api.model.ProjectAnalysisJobRender = squid_api.model.ProjectAnalysisJob.extend({
        urlRoot: function() {
            return squid_api.model.ProjectAnalysisJob.prototype.urlRoot.apply(this, arguments) + "." + this.get("format");
        },
        error: null
    });
    
    squid_api.model.AnalysisJob = squid_api.model.BaseModel.extend({
        results: null,

        initialize: function(attributes, options) {
            this.set("id", {
                "projectId": squid_api.projectId,
                "analysisJobId": null
            });
            if (squid_api.domainId) {
                this.setDomainIds([squid_api.domainId]);
            }
        },

        setProjectId : function(projectId) {
            this.set({"id": {
                "projectId": projectId,
                "analysisJobId": null
            },
            "oid" : null,
            "domains": null,
            "dimensions" : null,
            "metrics" : null,
            "selection" : null,
                "results" : null
            });
            return this;
        },
        
        setDomain :  function(domain) {
            if (domain) {
                this.setDomainIds([domain]);
            }
        },

        setDomainIds : function(domainIdList) {
            var domains;
            if (domainIdList) {
                domains = [];
                for (var i=0; i<domainIdList.length; i++) {
                    if (domainIdList[i].projectId) {
                        domains.push({
                            "projectId": domainIdList[i].projectId,
                            "domainId": domainIdList[i].domainId
                        });
                    } else {
                        domains.push({
                            "projectId": this.get("id").projectId,
                            "domainId": domainIdList[i]
                        });
                    }
                }
            } else {
                domains = null;
            }
            this.set({"id": {
                    "projectId": this.get("id").projectId,
                    "analysisJobId": null
                },
                "oid" : null,
                "domains": domains,
                "dimensions": null,
                "metrics": null,
                "selection": null,
                "results" : null
            });
            return this;
        },

        setDimensionIds : function(dimensionIdList, silent) {
            var dims;
            if (dimensionIdList) {
                dims = [];
                for (var i=0; i<dimensionIdList.length; i++) {
                    if (dimensionIdList[i]) {
                        if (dimensionIdList[i].projectId) {
                            dims.push({
                                "projectId": dimensionIdList[i].projectId,
                                "domainId": dimensionIdList[i].domainId,
                                "dimensionId": dimensionIdList[i].dimensionId
                            });
                        } else {
                            dims.push({
                                "projectId": this.get("id").projectId,
                                "domainId": this.get("domains")[0].domainId,
                                "dimensionId": dimensionIdList[i]
                            });
                        }
                    }
                }
            } else {
                dims = null;
            }
            this.setDimensions(dims, silent);
            return this;
        },
        
        setFacets : function(facetList, silent) {
            var facets;
            if (facetList) {
                facets = [];
                for (var i=0; i<facetList.length; i++) {
                    if (facetList[i]) {
                        facets.push({
                            "value": facetList[i]
                        });
                    }
                }
            } else {
                facets = null;
            }
            silent = silent || false;
            this.set({"facets": facets}, {"silent" : silent});
            return this;
        },

        setDimensions : function(dimensions, silent) {
            silent = silent || false;
            this.set({"dimensions": dimensions}, {"silent" : silent});
            return this;
        },

        setDimensionId : function(dimensionId, index) {
            var dims = this.get("dimensions") || [];
            dims = dims.slice(0);
            index = index || 0;
            if (dimensionId.projectId) {
                dims[index] = {
                    "projectId": dimensionId.projectId,
                    "domainId": dimensionId.domainId,
                    "dimensionId": dimensionId.dimensionId
                };
            } else {
                dims[index] = {
                    "projectId": this.get("id").projectId,
                    "domainId": this.get("domains")[0].domainId,
                    "dimensionId": dimensionId
                };
            }
            this.setDimensions(dims);
            return this;
        },
        
        setFacet : function(facetId, index) {
            var facets = this.get("facets") || [];
            facets = facets.slice(0);
            index = index || 0;
            facets[index] = facetId;
            this.setFacets(facets);
            return this;
        },

        setMetricIds : function(metricIdList, silent) {
            var metrics;
            if (metricIdList) {
                metrics = [];
                for (var i=0; i<metricIdList.length; i++) {
                    if (metricIdList[i]) {
                        metrics.push({
                            "projectId": this.get("id").projectId,
                            "domainId": this.get("domains")[0].domainId,
                            "metricId": metricIdList[i]
                        });
                    }
                }
            } else {
                metrics = null;
            }
            this.setMetrics(metrics, silent);
            return this;
        },
        
        setMetrics : function(metricsArg, silent) {
            var metrics = [];
            silent = silent || false;
            if (metricsArg) {
                for (var i=0; i<metricsArg.length; i++) {
                    var metric = metricsArg[i];
                    if (metric) {
                        if (metric instanceof Object) {
                            // metric is already on object
                            if (metric.projectId) {
                                // but is just a PK
                                metrics.push({
                                    "id" : metric
                                });
                            } else {
                                metrics.push(metric);
                            }
                        } else {
                            // metric is just an Id
                            metrics.push({
                                "id" : {
                                    "projectId": this.get("id").projectId,
                                    "domainId": this.get("domains")[0].domainId,
                                    "metricId": metric
                                }
                            });
                        }
                    }
                }
                this.set({"metricList": metrics}, {"silent" : silent});
            }
            return this;
        },
        
        setMetricId : function(metricId, index) {
            var items = this.get("metrics") || [];
            items = items.slice(0);
            index = index || 0;
            items[index] = {
                "projectId": this.get("id").projectId,
                "domainId": this.get("domains")[0].domainId,
                "metricId": metricId
            };
            this.setMetrics(items);
            return this;
        },
        
        setSelection : function(selection, silent) {
            silent = silent || false;
            var cleanSelection = squid_api.utils.buildCleanSelection(selection);
            selection = cleanSelection;
            this.set({"selection": selection}, {"silent" : silent});
            return this;
        },

        isDone : function() {
            return (this.get("status") == "DONE");
        }
    });

    squid_api.model.MultiAnalysisJob = Backbone.Model.extend({
        
        setProjectId : function(projectId) {
            var analyses = this.get("analyses");
            if (analyses) {
                for (var i=0; i<analyses.length;i++) {
                    analyses[i].setProjectId(projectId);
                }
            }
        },
        
        isDone : function() {
            return (this.get("status") == "DONE");
        }
    });

    // Controller definition

    var controller = {

        fakeServer: null,

        /**
         * Create (and execute) a new AnalysisJob.
         * @returns a Jquery Deferred
         */
        createAnalysisJob: function(analysisModel, selection) {

            var observer = $.Deferred();

            analysisModel.set("status","RUNNING");

            // create a new AnalysisJob
            var projectAnalysisJob = new squid_api.model.ProjectAnalysisJob();
            var projectId;
            if (analysisModel.get("id").projectId) {
                projectId = analysisModel.get("id").projectId;
            } else {
                projectId = analysisModel.get("projectId");
            }
            projectAnalysisJob.parameters = analysisModel.parameters;
            projectAnalysisJob.statusModel = squid_api.model.status;
            projectAnalysisJob.set(analysisModel.attributes);
            if ( (!analysisModel.get("selection")) && selection) {
                projectAnalysisJob.set("selection", selection);
            }
            projectAnalysisJob.set({"id" : {
                projectId: projectId,
                analysisJobId: null},
                "results" : null,
                "error" : null});

            // save the analysisJob to API
            if (this.fakeServer) {
                this.fakeServer.respond();
            }

            projectAnalysisJob.save({}, {
                success : function(model, response) {
                    if (model.get("error")) {
                        console.error("createAnalysis error " + model.get("error").message);
                        analysisModel.set("results", null);
                        analysisModel.set("error", model.get("error"));
                        analysisModel.set("status", "DONE");
                        observer.reject(model, response);
                    } else {
                        console.log("createAnalysis success");
                        analysisModel.set("id", model.get("id"));
                        analysisModel.set("oid", model.get("id").analysisJobId);
                        observer.resolve(model, response);
                    }
                },
                error : function(model, response) {
                    console.error("createAnalysis error");
                    analysisModel.set("results", null);
                    analysisModel.set("error", response);
                    analysisModel.set("status", "DONE");
                    observer.reject(model, response);
                }
            });

            return observer;
        },

        /**
         * Create (and execute) a new AnalysisJob, then retrieve the results.
         * @return a Promise
         */
        compute: function(analysisJob, filters) {
            if (analysisJob.get("analyses")) {
                // compute a multi analysis
                return this.computeMultiAnalysis(analysisJob, filters);
            } else {
                // compute a single analysis
                return this.computeSingleAnalysis(analysisJob, filters);
            }
        },

        /**
         * Retrieve job results (loop until DONE or error)
         */
        getAnalysisJobResults: function(observer, analysisModel) {
            observer = observer || $.Deferred();
            console.log("getAnalysisJobResults");
            var analysisJobResults = new squid_api.model.ProjectAnalysisJobResult();
            analysisJobResults.parameters = analysisModel.parameters;
            analysisJobResults.statusModel = squid_api.model.status;
            analysisJobResults.set("id", analysisModel.get("id"));
            analysisJobResults.set("oid", analysisModel.get("oid"));

            // get the results from API
            analysisJobResults.fetch({
                error: function(model, response) {
                    analysisModel.set("error", {message : response.statusText});
                    analysisModel.set("status", "DONE");
                    observer.reject(model, response);
                },
                success: function(model, response) {
                    if (model.get("apiError") && (model.get("apiError") == "COMPUTING_IN_PROGRESS")) {
                        // retry
                        controller.getAnalysisJobResults(observer, analysisModel);
                    } else {
                        var t = model.get("statistics");
                        if (t) {
                            console.log("AnalysisJob computation time : "+(t.endTime-t.startTime) + " ms");
                        }
                        // update the analysis Model
                        analysisModel.set("statistics", t);
                        analysisModel.set("error", null);
                        analysisModel.set("results", model.toJSON());
                        analysisModel.set("status", "DONE");
                        observer.resolve(model, response);
                    }
                }
            });
            if (this.fakeServer) {
                this.fakeServer.respond();
            }
        },
        
        /**
         * Retrieve job (loop until DONE or error)
         */
        getAnalysisJob: function(observer, analysisModel) {
            console.log("getAnalysisJob");
            var analysisJob = new squid_api.model.ProjectAnalysisJob();
            analysisJob.statusModel = squid_api.model.status;
            analysisJob.set("id", analysisModel.get("id"));
            analysisJob.set("oid", analysisModel.get("oid"));

            // get the results from API
            analysisJob.fetch({
                error: function(model, response) {
                    analysisModel.set("error", {message : response.statusText});
                    analysisModel.set("status", "DONE");
                    observer.reject(model, response);
                },
                success: function(model, response) {
                    if (model.get("status") && (model.get("status") != "DONE")) {
                        // retry in 1s
                        setTimeout(function() { 
                                controller.getAnalysisJob(observer, analysisModel); 
                            }, 1000);
                        
                    } else {
                        var t = model.get("statistics");
                        if (t) {
                            console.log("AnalysisJob computation time : "+(t.endTime-t.startTime) + " ms");
                        }
                        // update the analysis Model
                        analysisModel.set("statistics", t);
                        analysisModel.set("error", null);
                        analysisModel.set("status", "DONE");
                        observer.resolve(model, response);
                    }
                }
            });
            if (this.fakeServer) {
                this.fakeServer.respond();
            }
        },
        
        /**
         * Create (and execute) a new Single AnalysisJob, retrieve the results
         * and set the 'done' or 'error' attribute to true when all analysis are done or any failed.
         * @return Observer (Deferred)
         */
        computeSingleAnalysis: function(analysisJob, filters) {
            var selection, observer = $.Deferred();
               
            // compute a single analysis
            if (!filters) {
                if (!analysisJob.get("selection")) {
                    // use default filters
                    selection =  squid_api.model.filters.get("selection");
                } else {
                    selection = analysisJob.get("selection");
                }
            } else {
                selection =  filters.get("selection");
            }
            
            selection = squid_api.utils.buildCleanSelection(selection);
            
            // validate job
            if (((!analysisJob.get("metricList") || analysisJob.get("metricList").length === 0)) && (!analysisJob.get("dimensions") && (!analysisJob.get("facets") || analysisJob.get("facets").length === 0))) {
                observer.reject({"err" : "invalid_analysis", "message" : "Must at least define a metric or a dimension"});
            } else {
                this.createAnalysisJob(analysisJob, selection)
                    .done(function(model, response) {
                        if (model.get("status") == "DONE") {
                            var t = model.get("statistics");
                            if (t) {
                                console.log("AnalysisJob computation time : "+(t.endTime-t.startTime) + " ms");
                            }
                            // update the analysis Model
                            analysisJob.set("statistics", t);
                            analysisJob.set("error", model.get("error"));
                            analysisJob.set("results", model.get("results"));
                            analysisJob.set("status", "DONE");
                            observer.resolve(model, response);
                        } else {
                            // try to get the results
                            controller.getAnalysisJobResults(observer, analysisJob);
                        }
                    })
                    .fail(function(model, response) {
                        observer.reject(model, response);
                    });
            }

            return observer;
        },

        /**
         * Create (and execute) a new MultiAnalysisJob, retrieve the results
         * and set the 'done' or 'error' attribute to true when all analysis are done or any failed.
         */
        computeMultiAnalysis: function(multiAnalysisModel, filters) {
            var me = this;
            multiAnalysisModel.set("status", "RUNNING");
            var analyses = multiAnalysisModel.get("analyses");
            var analysesCount = analyses.length;
            // build all jobs
            var jobs = [];
            for (var i=0; i<analysesCount; i++) {
                var analysisModel = analyses[i];
                jobs.push(this.computeSingleAnalysis(analysisModel, filters));
            }
            console.log("analysesCount : "+analysesCount);
            // wait for jobs completion
            var combinedPromise = $.when.apply($,jobs);
            
            combinedPromise.always( function() {
                for (var i=0; i<analysesCount; i++) {
                    var analysis = analyses[i];
                    if (analysis.get("error")) {
                        multiAnalysisModel.set("error", analysis.get("error"));
                    }
                }
                multiAnalysisModel.set("status", "DONE");
            });
            return combinedPromise;
        },
        
        // backward compatibility
        
        computeAnalysis: function(analysisJob, filters) {
            return this.compute(analysisJob, filters);
        },
        
        AnalysisModel: squid_api.model.AnalysisJob,
        
        MultiAnalysisModel: squid_api.model.MultiAnalysisJob
        

    };
    

    squid_api.controller.analysisjob = controller;
    return controller;
}));

/*! Squid Core API FacetJob Controller V2.0 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD.
        define(['Backbone', 'squid_api'], factory);
    } else {
        factory(root.Backbone, root.squid_api);
    }
}(this, function (Backbone, squid_api) {
    
    /**
     * ProjectFacetJob : used to compute Facets from a Selection
     */
    squid_api.model.ProjectFacetJob = squid_api.model.ProjectModel.extend({
        urlRoot: function() {
            var id = this.get("id").facetJobId;
            return squid_api.model.ProjectModel.prototype.urlRoot.apply(this, arguments) + "/facetjobs/" + (id ? id : "");
        },
        error: null,
        domains: null,
        timeoutMillis: function() { 
            return squid_api.timeoutMillis; 
        }
    });

    /**
     * ProjectFacetJobResult : get the ProjectFacetJob's computation results (a Selection).
     */
    squid_api.model.ProjectFacetJobResult = squid_api.model.ProjectFacetJob.extend({
        urlRoot: function() {
            return squid_api.model.ProjectFacetJob.prototype.urlRoot.apply(this, arguments) + "/results/";
        },
        error: null,
        timeoutMillis: function() { 
            return squid_api.timeoutMillis; 
        }
    });
    
    /**
     * ProjectFacetJobFacet : get the Members of a single Facet.
     */
    squid_api.model.ProjectFacetJobFacet = squid_api.model.ProjectFacetJobResult.extend({
        urlRoot: function() {
            // facet id need url-encoding
            var id = encodeURIComponent(this.get("oid"));
            return squid_api.model.ProjectFacetJobResult.prototype.urlRoot.apply(this, arguments) + id;
        },
        error: null,
        timeoutMillis: function() { 
            return squid_api.timeoutMillis; 
        }
    });
    
    /**
     * FilterJob is the Model which is manipulated be the Filters panel.
     * This is not an API model but a JSSDK internal model.
     * It implements useful methods to manipulate the Selection.
     * Its "id" will be the id of the ProjectFacetJob which was used to compute its selection.
     */
    squid_api.model.FiltersJob = Backbone.Model.extend({

        initialize: function() {
            this.set("id", {
                "projectId": squid_api.projectId
            });
        },
        
        setProjectId : function(projectId) {
            this.set({"id": {
                "projectId": projectId
            },
            "domains": null,
            "selection" : null}
            );
            return this;
        },

        setDomainIds : function(domainIdList) {
            if (domainIdList) {
                var domains = [];
                for (var i=0; i<domainIdList.length; i++) {
                    var id = domainIdList[i];
                    if (id.domainId) {
                        domains.push(id);
                    } else {
                        domains.push({
                            "projectId": this.get("id").projectId,
                            "domainId": id
                        });
                    }
                }
                this.set({"domains" : domains});
            } else {
                if (this.get("domains")) {
                    this.set({"domains" : null});
                }
            }
            
            return this;
        },

        addSelection : function(dimension,value) {
            var facets = this.get("selection").facets;
            // check if the facet already exists
            var facetToUpdate;
            for (var i=0;i<facets.length;i++) {
                var facet = facets[i];
                if (facet.dimension.oid==dimension.id.dimensionId) {
                    facetToUpdate = facet;
                }
            }
            if (!facetToUpdate) {
                facetToUpdate = {
                        "dimension" : {
                            "id" : {
                                "projectId" : this.get("id").projectId,
                                "domainId" : dimension.id.domainId,
                                "dimensionId" : dimension.id.dimensionId
                            }
                        },
                        "selectedItems" : []
                };
                facets.push(facetToUpdate);
            }
            // update the facet
            facetToUpdate.selectedItems.push({
                "type" : "v",
                "id" : -1,
                "value" : value
            });
        },

        isDone : function() {
            return (this.get("status") == "DONE");
        },
        
        /*
         * Extract the selectedItem from the filters (in a more usable form).
         */
        getSelection : function() {
            var data = {}, item;
            var selection = this.get("selection");
            if (selection && selection.facets) {
                var index = 0;
                var facets = selection.facets;
                for (var i=facets.length-1;i>=0;i--) {
                    var facet = facets[i];
                    if ((!facet.dimension.type || facet.dimension.type=="CATEGORICAL" || facet.dimension.type=="INDEX") && facet.selectedItems && facet.selectedItems.length>0) {
                        var temp = [];
                        if (facet.items) {
                            for (var i2=0;i2<facet.items.length;i2++) {
                                item = facet.items[i2];
                                if (item.type=="v") {
                                    temp[item.id] = item.value;
                                }
                            }
                        }
                        var unique = [];
                        for (var j=0;j<facet.selectedItems.length;j++) {
                            item = facet.selectedItems[j];
                            if (item.type=="v") {
                                var sel = null;
                                var oid = facet.dimension.id.dimensionId;
                                var group = data[oid];
                                if (!group) {
                                    sel = [];
                                    data[oid] = 
                                    {"dimension":facet.dimension,
                                            "selection":sel};
                                } else {
                                    sel = group.selection;
                                }
                                var value = (item.id>=0 && item.id<temp.length)?temp[item.id]:item.value;
                                if (!unique[value]) {
                                    unique[value] = true;
                                    sel.push({"name":facet.dimension.name?facet.dimension.name:facet.dimension.id.dimensionId,
                                            "value":value,
                                            "item":item,
                                            "index":index++});
                                }
                            }
                        }
                    }
                }
            }
            return data;
        }
    });
    
    // Main Controller
    
    var controller = {

            fakeServer: null,
            
            /**
             * Streamline a selection (get rid of the facet items).
             */
            buildCleanSelection : function(selectionOpt) {
                return squid_api.utils.buildCleanSelection(selectionOpt);
            },
            
            getTemporalFacets : function(selection) {
                var timeFacets = [];
                if (selection && selection.facets) {
                    var facets = selection.facets;
                    for (var i = 0; i < facets.length; i++) {
                        var facet = facets[i];
                        // V2 way
                        if (facet.dimension.valueType && (facet.dimension.valueType === "DATE")) {
                            timeFacets.push(facet);
                        } else if (facet.selectedItems[0] && (facet.selectedItems[0].lowerBound || facet.selectedItems[0].upperBound)) {
                            // V1 way
                            timeFacets.push(facet);
                        }
                    }
                }
                return timeFacets;
            },
            
            getTemporalFacet : function(selection) {
                var timeFacet;
                var temporalFacets = this.getTemporalFacets(selection);
                if (temporalFacets.length>0) {
                    timeFacet = temporalFacets[0];
                }
                return timeFacet;
            },

            /**
             * Create (and execute) a new Job.
             */
            createJob: function(jobModel, selectionOpt, successCallback, dfd) {
                dfd = dfd || new $.Deferred();
                
                jobModel.set({"userSelection" :  null}, {"silent" : true});
                jobModel.set("status","RUNNING");

                // create a new Job
                
                if (!selectionOpt) {
                    selectionOpt =  jobModel.get("selection");
                }
                
                var selection = this.buildCleanSelection(selectionOpt);

                var projectFacetJob = new squid_api.model.ProjectFacetJob();
                projectFacetJob.statusModel = squid_api.model.status;
                var projectId;
                if (jobModel.get("id").projectId) {
                    projectId = jobModel.get("id").projectId;
                } else {
                    projectId = jobModel.get("projectId");
                }
                
                if (jobModel.get("engineVersion")) {
                    projectFacetJob.set("engineVersion",jobModel.get("engineVersion"));
                }

                projectFacetJob.set({"id" : {
                    projectId: projectId},
                    "domains" : jobModel.get("domains"),
                    "selection": selection});

                // save the job
                if (this.fakeServer) {
                    this.fakeServer.respond();
                }

                projectFacetJob.save({}, {
                    success : function(model, response) {
                        if (successCallback) {
                            successCallback(model, jobModel, dfd);
                        } else {
                            dfd.resolve();
                        }
                    },
                    error: function(model, response) {
                        console.error("create job error");
                        jobModel.set("error", response);
                        jobModel.set("status", "DONE");
                        dfd.reject();
                    }

                });
                
                return dfd.promise();
            },

            jobCreationCallback : function(projectFacetJob, jobModel, dfd) {
                dfd = dfd || new $.Deferred();
                jobModel.set("id", projectFacetJob.get("id"));
                jobModel.set("oid", projectFacetJob.get("oid"));
                if (projectFacetJob.get("status") == "DONE") {
                    var t = projectFacetJob.get("statistics");
                    if (t) {
                        console.log("FacetJob computation time : "+(t.endTime-t.startTime) + " ms");
                    }
                    // update the Model
                    jobModel.set("statistics", t);
                    jobModel.set("error", projectFacetJob.get("error"));
                    if (projectFacetJob.get("error")) {
                        // jobs returned an error
                        console.error("FacetJob computation error " + projectFacetJob.get("error").message);
                        squid_api.model.status.set("error", projectFacetJob.get("error"));
                    }
                    if (projectFacetJob.get("results")) {
                    	var facets = projectFacetJob.get("results").facets;
                        jobModel.set("selection", {"facets" : facets});
                    }
                    jobModel.set("status", "DONE");
                    dfd.resolve();
                } else {
                    // try to get the results
                    controller.getJobResults(jobModel, dfd);
                }
                return dfd.promise();
            },

            /**
             * Create (and execute) a new Job, then retrieve the results.
             * @param jobModel a FiltersJob
             * @param selection an optional array of Facets
             */
            compute: function(jobModel, selection, dfd) {
                dfd = dfd || new $.Deferred();
                this.createJob(jobModel, selection, this.jobCreationCallback, dfd);
                return dfd.promise();
            },
            
            /**
             * Retrieve facet members and retry until it is fully loaded.
             */
            getFacetMembers: function(jobModel, facetId, startIndex, maxResults, delay, dfd) {
                dfd = dfd || new $.Deferred();
                startIndex = startIndex || 0;
                maxResults = maxResults || 100;
                if (delay) {
                    // retry with a delay
                    setTimeout(function() {
                        controller.getFacetMembers(jobModel, facetId, startIndex, maxResults, null, dfd);
                    }, delay);
                } else {
                    console.log("getting Facet : "+facetId);
                    var facetJob = new squid_api.model.ProjectFacetJobFacet();
                    facetJob.statusModel = squid_api.model.status;
                    facetJob.set("id", jobModel.get("id"));
                    facetJob.set("oid", facetId);
                    if (startIndex) {
                        facetJob.addParameter("startIndex", startIndex);
                    }
                    if (maxResults) {
                        facetJob.addParameter("maxResults", maxResults);
                    }
                    facetJob.addParameter("waitComplete", true);
    
                    // get the results from API
                    facetJob.fetch({
                        error: function(model, response) {
                            jobModel.set("error", {message : response.statusText});
                            jobModel.set("status", "DONE");
                            dfd.reject();
                        },
                        success: function(model, response) {
                            if (model.get("apiError") && (model.get("apiError") == "COMPUTING_IN_PROGRESS")) {
                                // retry
                                controller.getFacetMembers(jobModel, facetId, startIndex, maxResults, 1000, dfd);
                            } else {
                                // update the Model
                                var facet;
                                var selection = jobModel.get("selection");
                                if (selection) {
                                    var facets = selection.facets;         
                                    for (fIdx = 0; fIdx < facets.length; fIdx++) {
                                        if (facets[fIdx].id == facetId) {
                                            facet = facets[fIdx];
                                            break;
                                        }
                                    }
                                } else {
                                    selection = [];
                                }
                                if (!facet) {
                                    // add a new facet to the selection
                                    selection.push(model);
                                    jobModel.set("selection", selection);
                                    dfd.resolve();
                                } else {
                                    // update the existing facet's items
                                    facet.items = model.get("items");
                                    if (model.get("done") === false) {
                                        // re-poll facet content
                                        controller.getFacetMembers(jobModel, facet.id, startIndex, maxResults, 1000, dfd);
                                    } else {
                                        dfd.resolve();
                                    }
                                }
                            }
                        }
                    });
                    if (this.fakeServer) {
                        this.fakeServer.respond();
                    }
                }
                return dfd.promise();
            },

            /**
             * retrieve the results.
             */
            getJobResults: function(jobModel, dfd) {
                dfd = dfd || new $.Deferred();
                var jobResults = new squid_api.model.ProjectFacetJobResult();
                jobResults.statusModel = squid_api.model.status;
                jobResults.set("id", jobModel.get("id"));
                jobResults.set("oid", jobModel.get("oid"));

                // get the results from API
                jobResults.fetch({
                    error: function(model, response) {
                        jobModel.set("error", {message : response.statusText});
                        jobModel.set("status", "DONE");
                        dfd.reject();
                    },
                    success: function(model, response) {
                        if (model.get("apiError") && (model.get("apiError") == "COMPUTING_IN_PROGRESS")) {
                            // retry
                            controller.getJobResults(jobModel);
                        } else {
                            var t = model.get("statistics");
                            if (t) {
                                console.log("FacetJob computation time : "+(t.endTime-t.startTime) + " ms");
                            }
                            // update the Model
                            jobModel.set("statistics", t);
                            jobModel.set("error", null);
                            jobModel.set("selection", {"facets" : model.get("facets")});
                            jobModel.set("status", "DONE");
                            dfd.resolve();
                        }
                    }
                });
                if (this.fakeServer) {
                    this.fakeServer.respond();
                }
                return dfd.promise();
            },
            
            /**
             * Unselect recursively all children
             */
            unSelectChildren : function(facets, facet, includeSelf) {
                var childDimension;
                var i=0;
                if (includeSelf) {
                    facet.selectedItems = [];
                }
                // treat children dimensions
                // build a facet map to retrieve parents by dimension id and not facet id
                var facetMap = {};
                for (i=0; i<facets.length; i++) {
                    facetMap[facets[i].dimension.oid] = facets[i];
                }
                // look for a child dimension
                for (i=0; ((i<facets.length) && !childDimension); i++) {
                    var facet1 = facets[i];
                    if (facet1.dimension.parentId) {
                        if (facetMap[facet1.dimension.parentId.dimensionId].id === facet.id) {
                            childDimension = facet1;
                        }
                    }
                }
                if (childDimension) {
                    this.unSelectChildren(facets, childDimension, true);
                }
            },
            
            unSelect : function(facets, facetId, memberId) {
                var childDimension;
                var i=0;
                var selectedFacet;
                for (i=0; i<facets.length; i++) {
                    var facet = facets[i];
                    if ((memberId === null) || (facet.id === facetId)) {
                        this.unSelectMember(facet, memberId);
                        selectedFacet = facet;
                        break;
                    }
                }
                // unselect recursively
                if (selectedFacet) {
                    this.unSelectChildren(facets, selectedFacet, false);
                }
            },
            
            unSelectMember : function(facet, memberId) {
                var selectedItems = facet.selectedItems;
                var facetIndex;
                for (var ix=0; ((ix<selectedItems.length) && !facetIndex); ix++) {
                    if ((memberId === null) || (memberId === selectedItems[ix].id)) {
                        facetIndex = ix;
                        selectedItems.splice(facetIndex,1);
                    }
                }
                return facetIndex;
            },

            // backward compatibility
            FiltersModel : squid_api.model.FiltersJob

    };

    squid_api.controller.facetjob = controller;
    return controller;
}));
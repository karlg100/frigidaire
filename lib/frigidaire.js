/*
 * Frigidaire Appliance Node.js Module
 *
 * Author Karl Grindley <@karlg100>
 *
 * Updated 2023.06.26 to support new V3 API
 * by Marek Brzozowski <@marekbrz>
 */

'use strict';

const fs = require('fs');

var debug = require('debug')('frigidaire:lib');
var extend = require('xtend');
var request = require('request');
//require('request').debug = true
var randomstring = require('randomstring');

// Constants
var REQUEST_TIMEOUT = 5000;
var LASTUPDATE_TIMEOUT = 60000;
var MAX_RETRIES = 10;
var SLEEP_TIME = 1200;

// toggle if we should send requests (disable for testing)
var SEND_REQUEST = true;

// New vars
var opts = {};

var defaults = {
    username: null,
    password: null,
    apiUrl: 'https://api.us.ecp.electrolux.com'
};

function parseJwt(token) {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
}

function Frigidaire(options, v3 = true) {
    if (!(this instanceof Frigidaire)) {
        return new Frigidaire(options, v3);
    }

    opts = extend(defaults, options);

    this.username = opts.username;
    this.password = opts.password;
    this.appVersion = opts.appVersion || "4.0.2";
    this.clientId = opts.clientId || "Gsdwexj38r1sXSXIPVdxj4DGoU5ZoaI6aW6ZckBI";
    this.userAgent = opts.userAgent || 'Frigidaire/81 CFNetwork/1121.2.2 Darwin/19.2.0';
    this.basicAuthToken = opts.basicAuthToken || this.clientId;
    this.deviceId = opts.deviceId || this.generateId();
    this.country = opts.country || 'US';
    this.brand = opts.brand || 'Frigidaire';
    this.sessionKey = opts.sessionKey || null;
    this.pollingInterval = opts.pollingInterval || 10000; // default to 10 seconds, so we don't hammer their servers
    this.disableTemp = opts.disableTemp || false;
    this.attempts = 0;
    this.deviceList = null;
    this.lastUpdate = null;
    this.updateTimer = [];
    this.v3api = v3;
    this.cacheDir = opts.cacheDir || null;

    // global lock for requests
    this.getBusy = false;
    this.postBusy = false;
    this.authPending = false;

    // attributes
    this.VERSION = '0011';
    this.FILTER = '1021';
    // 7001 - sleep mode
    this.MODE = '1000';
    this.SETPOINT = '0432';
    this.TEMP = '0430';
    this.UNIT = '0420';
    this.FANMODE = '1002';
    this.CURRENTSTATE = '0401'
    // 7008 - Model
    // 7009 - Serial Number
    // 7010 - NIU Version
    this.COOLINGSTATE = '04A1';
    // 7013 - unknown
    // 7020 - unknown
    // 7024 - unknown
    // 7025 - unknown
    // 7026 - unknown
    // 7027 - unknown
    this.CLEANAIR = '1004';
    // 7029 - unknown
    // 7030 - unknown
    // 7031 - unknown
    // 7036 - schedule on/off
    // 7038 - unknown
    // 7046 - unknown 
    // 7047 - unknown 
    // 7048 - unknown 
    // 7049 - unknown on/off what? off
    // 7051 - unknown "Image OK" Firmware checksum?

    // mode values
    this.FANMODE_AUTO = 7;
    this.FANMODE_HIGH = 4;
    this.FANMODE_MED = 2;
    this.FANMODE_LOW = 1;

    this.CLEANAIR_ON = 1;
    this.CLEANAIR_OFF = 0;

    this.COOLINGSTATE_OFF = 0;
    this.COOLINGSTATE_ON = 1;

    this.FILTER_GOOD = 0;
    this.FILTER_CHANGE = 2;

    this.MODE_OFF = 0;
    this.MODE_ECON = 4;
    this.MODE_FAN = 3;
    this.MODE_COOL = 1;

    this.FAHRENHEIT = 1;
    this.CELSIUS = 0;

    if (this.v3api) {
        LASTUPDATE_TIMEOUT = (this.pollingInterval / 1000) - 3;
        this.v3globalxapikey = '3BAfxFtCTdGbJ74udWvSe6ZdPugP8GcKz3nSJVfg' //DO NOT CHANGE
        this.v3oauthclientid = 'FrigidaireOneApp' //DO NOT CHANGE
        this.v3oauthclientsecret = '26SGRupOJaxv4Y1npjBsScjJPuj7f8YTdGxJak3nhAnowCStsBAEzKtrEHsgbqUyh90KFsoty7xXwMNuLYiSEcLqhGQryBM26i435hncaLqj5AuSvWaGNRTACi7ba5yu' //DO NOT CHANGE
        this.v3refreshToken = null
        this.v3accessToken = null
        this.v3apikey = null
        this.v3domain = null
        this.v3datacenter = null
        this.v3httpregionalbaseurl = null
        this.authPending = true
        this.authFailure = null
        this.homebridgeConfigPath = options.homebridgeConfigPath || null
        this.applianceInfo = null

        if (this.cacheDir) {
            if (fs.existsSync(this.cacheDir + '/.frigidaireRefreshToken_' + options.applianceSerial)) {
                debug('found stored refresh token, will attempt to use this refresh token to obtain access token')
                this.v3refreshToken = fs.readFileSync(this.cacheDir + '/.frigidaireRefreshToken_' + options.applianceSerial, 'utf8').trim()
            }
        }
    }

    // login and init
    this.init();
}

Frigidaire.prototype.set = function (name, value) {
    opts[name] = value;
};

Frigidaire.prototype.generateId = function () {
    return randomstring.generate({ length: 2, charset: 'hex' }).toLowerCase() + '-' +
        randomstring.generate({ length: 34, charset: 'hex' }).toLowerCase();
}

Frigidaire.prototype.parseJSON = function (result) {
    if (result) {
        try {
            var parsed = JSON.parse(result);
            //debug(parsed);
            //return {"status": "SUCCESS", "code": "success", "data": result};
            return parsed;
        } catch (e) {
            // we failed to parse the JSON, try again?
            console.error("failed to parse json: '" + body + "'");
            debug("failed to parse json: '" + body + "'");
            return { "status": "ERROR", "code": "unknown", "data": null };
        }
    } else {
        debug('parseJSON() - no result');
        return { "status": "ERROR", "code": "empty JSON string", "data": null };
    }
}

/**
 * New implementations (port of Colt JS)
 */
//Frigidaire.prototype.get = function(endpoint, args, callback, retry = true, dataType, timeout) {
Frigidaire.prototype.get = function (endpoint, args, callback, retry = true, dataType = 'json', timeout = REQUEST_TIMEOUT) {

    debug('get() - ' + endpoint);

    var self = this;

    if (self.v3api) {

    }
    else {
        if (!self.sessionKey) {
            debug('no sessionKey, starting auth sequence');
            self.getBusy = false;
            self.authStage1(function authStg1GetCallback(err, response) {
                if (err) {
                    return callback(err);
                }
                //debug(response)
                //self.sessionKey = response
                self.get(endpoint, args, callback, retry, dataType, timeout);
            });
            return;
        }
        debug("get() - post auth stage");
        var query = {};

        //debug(args);
        for (var key in args) {
            if (typeof args[key] == 'string') {
                args[key] = args[key].replace(/[\\\']/g, '');
            }

            query[key] = args[key];
        }

        var url = opts.apiUrl + endpoint + args.join('/');
        var headers = {
            'x-ibm-client-id': this.clientId,
            'User-Agent': this.userAgent,
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + this.basicAuthToken,
            'x-api-key': this.basicAuthToken
        }
        //debug(query);

        //var query = []

        headers['session_token'] = this.sessionKey;

        if (!this.sessionKey) {
            debug("get() - No session key, returning");
            return;
        }

        if ('undefined' === typeof SEND_REQUEST || SEND_REQUEST) {
            request.get({ url: url, headers: headers, parameters: query, jar: true, strictSSL: false, timeout: timeout }, function (err, response, body) {

                if (err) {
                    debug("Error " + err + " Response: " + response + " Body: " + body);
                    self.getBusy = false;
                    return callback(err);
                }

                //debug("testing for maximum retries");
                if (self.attempts >= MAX_RETRIES) {
                    err = new Error('maximum retries, giving up.');
                    self.attempts = 0;
                    self.getBusy = false;
                    return callback(err);
                }

                ++self.attempts;

                //debug("testing for response");
                if (!response) {
                    // something hung up in the SSL or TCP connect session.  try again.
                    debug('no response, retry!');
                    self.getBusy = false;
                    //return self.get(endpoint, args, callback, retry, dataType, timeout);
                    return;
                }

                //debug(body)

                var jsonResponse = self.parseJSON(body)
                //var jsonResponse = JSON.parse(body)
                if (jsonResponse.status === 'ERROR' && jsonResponse.code === 'ECP0105') {
                    debug("Received error ECP0105 indicating bad session token. resetting plugin state...")
                    self.getBusy = false;
                    self.init();
                    //self.sessionKey = null;
                    return;
                    //return self.get(endpoint, args, callback, retry, dataType, timeout)
                }

                //debug("testing for errors");
                if (response.statusCode != 200) {
                    debug(" Not a 200 status code.  Response: " + response + " Body: " + body);
                    err = new Error(response.statusCode + ' ' + response.statusMessage);
                    return;
                }

                self.getBusy = false;
                debug("get() - end request callback");
                return callback(null, body);
            });
        }
    }

}

Frigidaire.prototype.post = function (applianceObj, endpoint, args, body, callback, authPost = false, retry = true, dataType = 'json', timeout = REQUEST_TIMEOUT) {
    debug('post()');
    //debug(applianceObj);
    var self = this;

    if (!self.sessionKey && authPost != true) {
        debug('no sessionKey, starting auth sequence');
        //self.postBusy = false;
        return self.authStage1(function (err, response) {
            if (err) {
                return callback(err);
            }
            return self.post(applianceObj, endpoint, args, body, callback, retry, dataType, timeout);

        });
    }

    var url = opts.apiUrl + endpoint + args.join('/');
    var headers = {
        'x-ibm-client-id': this.clientId,
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + this.basicAuthToken,
        'x-api-key': this.basicAuthToken
    }

    if (this.sessionKey)
        headers['session_token'] = this.sessionKey;

    if (applianceObj) {
        var urlQueryString = "?pnc=" + applianceObj.pnc + "&elc=" + applianceObj.elc + "&sn=" + applianceObj.sn + "&mac=" + applianceObj.mac;
        url = url + urlQueryString
    }

    debug('url: %s', url);
    //debug('headers: %s', headers);
    //debug('form: %s', form);
    debug('attempts: %s', self.attempts);

    if ('undefined' === typeof SEND_REQUEST || SEND_REQUEST) {
        request.post({ url: url, headers: headers, json: body, strictSSL: false, timeout: timeout },
            function postResponseCallback(err, response, body) {

                //debug(body)

                debug("testing for maximum retries");
                if (self.attempts >= MAX_RETRIES) {
                    err = new Error('maximum retries, giving up.');
                    self.attempts = 0;
                    self.postBusy = false;
                    return callback(err);
                }

                //debug("testing for response");
                if (!response) {
                    // something hung up in the SSL or TCP connect session.  try again.
                    debug('no response, retry!');
                    self.postBusy = false;
                    return self.post(applianceObj, endpoint, args, body, callback, authPost, retry, dataType, timeout);
                }

                //debug("get() : statusCode - "+response.statusCode);
                //debug("get() : body - "+body);
                //debug("get() : callback - "+callback);

                //debug("testing for 401 init");
                //if (response.statusCode == 401 && self.stage == 1) {
                if (response.statusCode == 401) {
                    self.postBusy = false;
                    return callback(null, body);
                }

                //debug("testing for errors");
                if (!err && response.statusCode != 200) {
                    err = new Error(response.statusCode + ' ' + response.statusMessage);
                }

                if (err) {
                    debug("Error " + response.statusCode + " : " + response.statusMessage);
                    self.postBusy = false;
                    return callback(err);
                }

                debug("reseting attempts");
                self.attempts = 0;

                //debug("everything good, callback time");
                self.postBusy = false;
                return callback(null, body);
            }
        );
    }
}

Frigidaire.prototype.init = function () {
    if (this.v3api) {
        let self = this
        debug("init (v3 api)");
        this.endpointDetails(function (err, response) {
            if (err) {
                return err;
            }

            debug(JSON.stringify((response)))

            self.v3apikey = response['apiKey']
            self.v3datacenter = response['dataCenter']
            self.v3domain = response['domain']
            self.v3httpregionalbaseurl = response['httpRegionalBaseUrl']

            self.accessToken(function (accessTokenErr, accessTokenResponse) {
                if (accessTokenErr) {
                    self.authFailure = accessTokenErr
                    return accessTokenErr;
                }

                self.v3accessToken = accessTokenResponse

                self.getDevices(function (err, data) {
                    debug("getDevices (v3 api) - callback");
                    if (!self.deviceList) {
                        debug("accessToken() -> getDevices() -> deviceList is empty!");
                        return;
                    }
                    self.deviceList.forEach((device) => {
                        debug("getDevices() - callback() - getting telem for " + device.sn);
                        self.getTelem(device.sn, function (err, data) { });
                    });
                    return;
                });
            })
        });
        //this.accessToken();

    }
    else {
        debug("init()");

        var self = this
        //this.updateTimer.forEach(function (timer) {
        //clearInterval(timer);
        //});
        //this.updateTimer = [];
        this.deviceList = null;
        this.sessionKey = null;
        this.lastUpdate = null;
        this.authPending = false;
        request.jar();

        this.authStage1(function (err, data) {
            debug("init() -> authStage1 callback");
            self.getDevices(function (err, data) {
                debug("getDevices() - callback");
                if (!self.deviceList) {
                    debug("authStage1() -> getDevices() -> deviceList is empty!");
                    return;
                }
                self.deviceList.forEach((device) => {
                    debug("getDevices() - callback() - getting telem for " + device.sn);
                    self.getTelem(device.sn, function (err, data) { });
                });
                return;
            });
            return;
        });
        debug("init() - end");
    }

    return;
}

Frigidaire.prototype.scheduleUpdates = function (applianceSn, callback) {
    var self = this;

    debug("scheduling callbacks....");

    var sleepTime = self.pollingInterval + Math.floor(Math.random() * Math.floor(500)); // we need some randomness, otherwise one will always fail to run
    //var timer = setInterval(function(){ self.getTelemUpdate(applianceId, callback); }, sleepTime);
    var timer = setInterval(function () { self.getTelem(applianceSn, callback); }, sleepTime);
    self.updateTimer.push(timer);
}

Frigidaire.prototype.authStage1 = function authStage1Callback(callback) {
    debug("authStage1()");

    if (this.authPending == true) {
        var sleepTime = 1000;
        //debug("auth already running running, calling callback in " + sleepTime + "ms");
        //return setTimeout(function () { callback(null, {}) }, sleepTime);
        debug("authStage1() - auth already running running, exiting");
        //callback(null, {})
        return;
    }

    this.authPending = true;
    var self = this;
    //debug("testing for maximum retries");
    if (self.attempts >= MAX_RETRIES) {
        var err = new Error('maximum retries, giving up.');
        self.attempts = 0;
        self.postBusy = false;
        return callback(err);
    }
    ++self.attempts;

    if (!this.username) {
        return callback(new Error('Missing parameter \'username\''));
    }

    if (!this.password) {
        return callback(new Error('Missing parameter \'password\''));
    }

    //this.sessionKey = this.generateId();

    var headers = {
        'x-ibm-client-id': this.clientId,
        'User-Agent': this.userAgent,
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + this.basicAuthToken,
        'x-api-key': this.basicAuthToken
    }

    var authBody = {
        "username": this.username,
        "password": this.password,
        "brand": this.brand,
        "deviceId": this.deviceId,
        "country": this.country,
    }

    var authUrl = opts.apiUrl + '/authentication/authenticate'

    debug("authStage1() - post()");
    request.post({ url: authUrl, headers: headers, json: authBody, strictSSL: false }, function authPostCallback(err, response, body) {
        debug("authStage1() - postCallback()");
        if (err) {
            debug('auth error: ') + err;
            self.init();
            return callback(err);
        }
        var json = body;

        if (json.status === 'ERROR' && json.code === 'ECP0108') {
            err = new Error(json.code + ' ' + json.message);
            return callback(err)
        }

        try {
            self.sessionKey = json.data.sessionKey;
        } catch (e) {
            // we failed to parse the JSON, try again?
            console.error("failed to parse auth result json: '" + json + "'");
        }

        var sessionKey = body.data.sessionKey
        debug('Acquired new sessionKey: ' + sessionKey)
        self.attempts = 0;

        self.authPending = false;
        return callback(null, {})
    });
    debug("authStage1() - end");
}

Frigidaire.prototype.endpointDetails = function endpointDetailsCallback(callback) {
    function getEndpointDetails(endpointCallbackFn, frigidaireObj) {
        if (frigidaireObj.v3apikey
            && frigidaireObj.v3domain
            && frigidaireObj.v3datacenter
            && frigidaireObj.v3apikey
            && frigidaireObj.v3datacenter
            && frigidaireObj.v3httpregionalbaseurl) {
            return endpointCallbackFn(null, JSON.stringify([
                {
                    "domain": frigidaireObj.v3domain,
                    "apiKey": frigidaireObj.v3apikey,
                    "brand": "frigidaire",
                    "httpRegionalBaseUrl": frigidaireObj.v3httpregionalbaseurl,
                    "dataCenter": frigidaireObj.v3datacenter
                }
            ]))
        }
        else {
            return request.post({
                url: 'https://api.ocp.electrolux.one/one-account-authorization/api/v1/token', json: {
                    "grantType": "client_credentials",
                    "clientId": frigidaireObj.v3oauthclientid,
                    "clientSecret": frigidaireObj.v3oauthclientsecret,
                    "scope": ""
                }, strictSSL: false
            }, function (err, response, body) {
                debug("auth step 1 - app bearer token");
                if (err) {
                    debug('auth error: ') + err;
                    return err;
                }

                let endpointPostHeaders = {
                    'Accept-Charset': 'UTF-8',
                    'Accept': 'application/json',
                    'x-api-key': frigidaireObj.v3globalxapikey,
                    'Authorization': 'Bearer ' + body['accessToken']
                }

                return request.get({
                    url: 'https://api.ocp.electrolux.one/one-account-user/api/v1/identity-providers?brand=frigidaire&email=' + frigidaireObj.username,
                    headers: endpointPostHeaders,
                    strictSSL: false
                }, function (err, response, body) {
                    debug("auth step 2 - user endpoint info");
                    if (err) {
                        debug('auth error: ' + err);
                        return callback('auth error: ' + err);
                    }
                    if (response.statusCode < 199 || response.statusCode > 299) {
                        debug('auth http error: ' + response.statusCode + ' ' + response.statusMessage)
                        return callback('auth http error: ' + response.statusCode + ' ' + response.statusMessage)
                    }
                    return endpointCallbackFn(null, body)
                }
                )
            }
            )
        }
    }

    if (this.cacheDir) {
        let cacheDir = this.cacheDir
        if (fs.existsSync(this.cacheDir + '/connectionInfo')) {
            var endpointInfo = JSON.parse(fs.readFileSync(this.cacheDir + '/connectionInfo', 'utf8'));

            return callback(null, endpointInfo)
        }
        else {
            return getEndpointDetails(function (err, result) {
                if (err) {
                    debug('auth error: ' + err);
                    return callback('auth error: ' + err);
                }
                let responseObj = JSON.parse(result)[0]

                fs.writeFileSync(cacheDir + '/connectionInfo', JSON.stringify(responseObj));

                return callback(null, responseObj)
            }, this)
        }
    }
    else {
        return getEndpointDetails(function (err, result) {
            if (err) {
                debug('auth error: ' + err);
                return callback('auth error: ' + err);
            }
            let responseObj = JSON.parse(result)[0]

            return callback(null, responseObj)
        }, this)
    }
}

Frigidaire.prototype.accessToken = function accessTokenCallback(callback) {

    function getAccessTokenFromRefreshToken(callbackFn, frigidaireObj) {
        let loginUrl = frigidaireObj.v3httpregionalbaseurl + '/one-account-authorization/api/v1/token'
        let fullLoginUrl = loginUrl
        return request.post({
            url: fullLoginUrl, headers: {
                "Origin-Country-Code": frigidaireObj.v3datacenter,
                "x-api-key": frigidaireObj.v3globalxapikey
            },
            json: {
                "grantType": "refresh_token",
                "clientId": frigidaireObj.v3oauthclientid,
                "refreshToken": frigidaireObj.v3refreshToken
            }, strictSSL: false
        }, function (err, response, body) {
            debug("user auth step 1.5 - access token from refresh token");
            if (err) {
                console.error('auth error: ') + err;
                return callbackFn({
                    "responseBody": JSON.stringify(err),
                    "frigidaireObj": frigidaireObj
                });
            }

            let responseBody = null
            if (typeof body == 'string') {
                responseBody = JSON.parse(body)
            }
            else {
                responseBody = body
            }

            if (response['statusCode'] < 200 || response['statusCode'] > 299) {
                return callbackFn({
                    "responseBody": JSON.stringify(responseBody),
                    "frigidaireObj": frigidaireObj
                })
            }

            frigidaireObj.v3refreshToken = responseBody['refreshToken']
            frigidaireObj.v3accessToken = responseBody['accessToken']

            frigidaireObj.authPending = false

            if (frigidaireObj.cacheDir) {
                fs.writeFileSync(frigidaireObj.cacheDir + '/.frigidaireRefreshToken_' + opts.applianceSerial, responseBody['refreshToken']);
                debug('wrote new refresh token to file: ' + frigidaireObj.cacheDir + '/.frigidaireRefreshToken_' + opts.applianceSerial)
            }

            return callbackFn(null, responseBody['accessToken'])

        }
        )
    }

    function getAccessTokenFullLogin(callbackFn, frigidaireObj) {
        let loginUrl = 'https://accounts.' + frigidaireObj.v3domain + '/accounts.login'
        let queryString = 'format=json&httpStatusCodes=false&include=id_token&apikey=' + frigidaireObj.v3apikey + '&loginID=' + frigidaireObj.username + '&password=' + frigidaireObj.password
        let fullLoginUrl = loginUrl + '?' + queryString
        return request.get({
            url: fullLoginUrl, headers: {
                "User-Agent": "frigidaireApp/5855 CFNetwork/1335.0.3.1 Darwin/21.6.0",
                "Accept": "application/json",
                'content-type': 'application/json'
            }, strictSSL: false
        }, function (err, response, body) {
            debug("user auth step 1 - gigya login");
            if (err) {
                debug('auth error: ') + err;
                return callbackFn(err);
            }
            let responseBody = JSON.parse(body)

            if (responseBody['statusCode'] < 200 || responseBody['statusCode'] > 299) {
                return callbackFn(JSON.stringify(responseBody))
            }

            return request.post({
                url: frigidaireObj.v3httpregionalbaseurl + '/one-account-authorization/api/v1/token',
                headers: {
                    "x-api-key": frigidaireObj.v3globalxapikey,
                    "Origin-Country-Code": frigidaireObj.v3datacenter
                },
                json: {
                    "grantType": "urn:ietf:params:oauth:grant-type:token-exchange",
                    "clientId": frigidaireObj.v3oauthclientid,
                    "idToken": responseBody['id_token'],
                    "scope": ""
                },
                strictSSL: false
            }, function (err, response, body) {
                debug("user auth step 2 - token exchange");
                if (err) {
                    debug('auth error: ' + err);
                    return callback('auth error: ' + err);
                }
                if (response.statusCode < 199 || response.statusCode > 299) {
                    debug('auth http error: ' + response.statusCode + ' ' + response.statusMessage)
                    return callback('auth http error: ' + response.statusCode + ' ' + response.statusMessage)
                }
                frigidaireObj.v3refreshToken = body['refreshToken']
                frigidaireObj.v3accessToken = body['accessToken']

                frigidaireObj.authPending = false

                if (frigidaireObj.cacheDir) {
                    fs.writeFileSync(frigidaireObj.cacheDir + '/.frigidaireRefreshToken_' + opts.applianceSerial, body['refreshToken']);
                    debug('wrote new refresh token to file: ' + frigidaireObj.cacheDir + '/.frigidaireRefreshToken_' + opts.applianceSerial)
                }

                return callbackFn(null, body['accessToken'])

            }
            )

        }
        )
    }

    if (this.v3accessToken) {
        var parsedAccessToken = parseJwt(this.v3accessToken)
        let expDateStr = new Date(parsedAccessToken['exp'] * 1000).toISOString()
        let issuedDateStr = new Date(parsedAccessToken['iat'] * 1000).toISOString()
        let debugDateStr = new Date((parsedAccessToken['exp'] * 1000) - 600000).toISOString()
        let nowDateStr = new Date(Date.now()).toISOString()
        debug('Access Token | Expiration: ' + expDateStr + ' Issued: ' + issuedDateStr + ' Renew at: ' + debugDateStr + ' Now: ' + nowDateStr)
        if ((parsedAccessToken['exp'] * 1000) - 600000 > Date.now()) {
            //if ((parsedAccessToken['iat'] * 1000) + 120000 > Date.now()) {
            this.authPending = false
            debug('Found existing usable access token, using that')
            return callback(null, this.v3accessToken)
        }
    }

    if (this.v3refreshToken) {
        return getAccessTokenFromRefreshToken(function (err, result) {
            if (err) {
                console.error('auth error: ' + err['responseBody']);
                return getAccessTokenFullLogin(function (err, result) {
                    if (err) {
                        debug('auth error: ' + err);
                        return callback('auth error: ' + err);
                    }
                    return callback(null, result)
                }, err['frigidaireObj'])
            }
            return callback(null, result)
        }, this)
    }
    else {
        return getAccessTokenFullLogin(function (err, result) {
            if (err) {
                debug('auth error: ' + err);
                return callback('auth error: ' + err);
            }
            return callback(null, result)
        }, this)
    }
}

Frigidaire.prototype.v3sendAction = function (callback, applianceId, attempt, action, actionValue, frigidaireObj) {
    debug('send action (v3)');

    ++attempt;
    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }

    let uri = '/appliance/api/v2/appliances/' + applianceId + '/command'

    let putBody = {}
    putBody[action] = actionValue

    return self.accessToken(function (err, token) {
        if (err) {
            return callback(err)
        }

        request.put({
            url: self.v3httpregionalbaseurl + uri,
            headers: {
                "User-Agent": "Ktor client",
                "Accept": "application/json",
                'content-type': 'application/json',
                'x-api-key': self.v3globalxapikey,
                'Authorization': 'Bearer ' + token.trim()
            },
            json: putBody,
            strictSSL: false
        }, function (err, response) {
            if (err) {
                return callback(err);
            }

            if (response.statusCode < 200 || response.statusCode > 200) {
                return callback(response.statusMessage)
            }
            else {
                return callback(null, {
                    status: response.statusMessage,
                    date: response.headers['date']
                });

            }

        });
    })

}

Frigidaire.prototype.getDevice = function (applianceSn) {
    var self = this;
    var applianceObj = false;
    debug('getDevice() - sn: ' + applianceSn);

    if (!applianceSn)
        applianceSn = self.deviceList[0].sn;

    for (var i = 0; i < self.deviceList.length; i++) {
        //debug(self.deviceList[i])
        if (self.deviceList[i].sn === applianceSn) {
            debug('found appliance match!')
            applianceObj = self.deviceList[i];
            break;
        }
    }

    if (applianceObj == false)
        debug('no appliance found! ensure correct serial number entered in config');
    return applianceObj;
};

Frigidaire.prototype.getDeviceV3 = function (applianceSn, attempt = 0, callback, frigidaireObj) {
    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }
    var applianceObj = false;
    debug('getDevice() - sn: ' + applianceSn);

    if (!applianceSn)
        applianceSn = self.deviceList[0].sn;

    if (self.authPending == true || !self.deviceList) {
        attempt++
        if (attempt > MAX_RETRIES) {
            debug("getDevice() - max retries reached. Not rescheduling.");
            return;
        }
        debug("getDevice() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
        setTimeout(self.getDevice, SLEEP_TIME, applianceSn, callback, attempt, self);
        //callback(null, {})
        return;
    }

    for (var i = 0; i < self.deviceList.length; i++) {
        //debug(self.deviceList[i])
        if (self.deviceList[i].sn === applianceSn) {
            debug('found appliance match!')
            applianceObj = self.deviceList[i];
            break;
        }
    }

    if (applianceObj == false)
        debug('no appliance found! ensure correct serial number entered in config');

    return callback(applianceObj)
};

Frigidaire.prototype.getDeviceIndex = function (applianceSn) {
    var self = this;
    debug('getDeviceIndex() - sn: ' + applianceSn);

    if (!applianceSn)
        return 0;

    for (var i = 0; i < self.deviceList.length; i++) {
        //debug(self.deviceList[i])
        if (self.deviceList[i].sn === applianceSn) {
            debug('found appliance match!')
            return i;
        }
    }

    debug('no appliance found! ensure correct serial number entered in config');
    return false;
};

Frigidaire.prototype.telemPopulated = function () {
    if (!this.deviceList) {
        debug("telemPopulated() - no deviceList");
        return false;
    }
    for (var i = 0; i < this.deviceList.length; i++) {
        if (!this.deviceList[i].telem) {
            debug("telemPopulated() - missing telementry for device " + this.deviceList[i].sn);
            return false;
        }
    }
    return true;
}

Frigidaire.prototype.getTelem = function (applianceSn, callback) {
    debug('getTelem() - ' + applianceSn);
    var self = this
    if (this.lastUpdate - Math.round(Date.now() / 1000) > LASTUPDATE_TIMEOUT) {
        self.lastUpdate = Math.round(Date.now() / 1000);
        callback("getTelem() - Exceeded lastUpdate timeout " + LASTUPDATE_TIMEOUT + ", calling init()");
        this.init();
        return;
    }

    if (!this.deviceList) {
        //var sleepTime = Math.floor(Math.random() * Math.floor(500));
        //var sleepTime = 1000;
        //debug("getTelem() - waiting for deviceList to populate, sleeping for " + sleepTime);
        //return setTimeout(function () { self.getTelem(applianceSn, callback) }, sleepTime);
        debug("getTelem() - no deviceList, exiting");
        return;
    }

    if (this.v3api) {
        if ((Math.round(Date.now() / 1000) - this.lastUpdate) > LASTUPDATE_TIMEOUT) {
            this.accessToken(function (accessTokenErr, accessTokenResponse) {
                if (accessTokenErr) {
                    self.authFailure = accessTokenErr
                    return accessTokenErr;
                }

                self.v3accessToken = accessTokenResponse

                self.getDevices(function (err, data) {
                    debug("getDevices (v3 api) - callback");
                    if (!self.deviceList) {
                        debug("accessToken() -> getDevices() -> deviceList is empty!");
                        return;
                    }
                    self.deviceList.forEach((device) => {
                        debug("getDevices() - callback() - getting telem for " + device.sn);
                        self.getTelem(device.sn, function (err, data) { });
                    });
                    return;
                });
            })
            this.lastUpdate = Math.round(Date.now() / 1000);
            return;
        }

        let applianceIndex = this.getDeviceIndex(applianceSn);
        let appliance = this.deviceList[applianceIndex]

        debug('getTelemCallback (v3) - end');

        return callback(null, appliance);
    }
    else {

        var uri = '/elux-ms/appliances/latest'

        var applianceIndex = self.getDeviceIndex(applianceSn);

        var urlQueryString = "?pnc=" + self.deviceList[applianceIndex].pnc + "&elc=" + self.deviceList[applianceIndex].elc + "&sn=" + self.deviceList[applianceIndex].sn + "&mac=" + self.deviceList[applianceIndex].mac;
        uri = uri + urlQueryString

        self.get(uri, [], function (err, data) {
            if (err) {
                return callback(err);
            }

            var jsonData = self.parseJSON(data);
            if (jsonData.status === 'ERROR') {
                debug('getTelemCallback() - error parsing JSON: ' + jsonData);
                return callback('JSON parse error', null);
            }
            self.deviceList[applianceIndex].telem = jsonData.data;

            //debug(self.deviceList);
            self.lastUpdate = Math.round(Date.now() / 1000);
            debug('getTelemCallback() - end');
            return callback(null, jsonData.data);
        });
    }

    debug('getTelem() - end');
};

Frigidaire.prototype.getDevices = function (callback, self = this, attempt = 0) {
    if (self.v3api) {
        debug('getDevices (v3)');
        if (self.authPending == true) {
            ++attempt;
            if (attempt > MAX_RETRIES) {
                debug("getDevices() - max retries reached. Not rescheduling.");
                return;
            }
            debug("getDevices() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
            setTimeout(self.getDevices, SLEEP_TIME, callback, self, attempt);
            //callback(null, {})
            return;
        }

        let uri = '/appliance/api/v2/appliances?includeMetadata=true'
        return self.accessToken(function (err, token) {
            if (err) {
                return callback(err)
            }

            request.get({
                url: self.v3httpregionalbaseurl + uri,
                headers: {
                    "User-Agent": "Ktor client",
                    "Accept": "application/json",
                    'content-type': 'application/json',
                    'x-api-key': self.v3globalxapikey,
                    'Authorization': 'Bearer ' + token.trim()
                },
                strictSSL: false
            }, function (err, response, body) {
                if (err) {
                    return callback(err);
                }

                var parsedData = self.parseJSON(body)
                //var parsedData = JSON.parse(data)
                //debug(parsedData);
                if (parsedData.length == 0) {
                    debug('getTelemCallback() - no devices found');
                    return callback('No devices found', null);
                }

                if (Array.isArray(parsedData)) {
                    let applianceData = parsedData.map((item) => {
                        return {
                            'nickname': item.applianceData.applianceName,
                            applianceId: item.applianceId.split(':')[1],
                            'appliance_type': item.applianceId.split(':')[0],
                            'pnc': item.applianceId.split(':')[0].split('_')[0],
                            'elc': item.applianceId.split(':')[0].split('_')[1],
                            'sn': item.applianceId.split(':')[1].split('-')[0],
                            'mac': item.applianceId.split(':')[1].split('-')[1],
                            'telem': item.properties.reported,
                            'version': item.properties.reported && item.properties.reported.networkInterface
                                && item.properties.reported.networkInterface.swVersion ? item.properties.reported.networkInterface.swVersion.replace(/[^\d.-]/g, '') : null,
                            'fullId': item.applianceId
                        }
                    })
                    self.deviceList = applianceData;

                    if (!self.applianceInfo) {
                        let applianceIdArray = self.deviceList.map((item) => item['fullId'])
                        self.getApplianceInfo(applianceIdArray, function (err, result) {
                            self.lastUpdate = Math.round(Date.now() / 1000);
                            callback(null, applianceData);
                            return;
                        }, 0, self)
                    }
                    else {
                        self.lastUpdate = Math.round(Date.now() / 1000);
                        callback(null, applianceData);
                        return;
                    }
                }
                else {
                    debug(JSON.stringify(parsedData))
                    callback(null, []);
                    return;
                }

            });
        })

    }
    else {
        debug('getDevices()');

        if (self.authPending == true) {
            ++attempt;
            if (attempt > MAX_RETRIES) {
                debug("getDevices() - max retries reached. Not rescheduling.");
                return;
            }
            debug("getDevices() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
            setTimeout(self.getDevices, SLEEP_TIME, callback, self, attempt);
            //callback(null, {})
            return;
        }

        if (self.deviceList) {
            callback(null, self.deviceList);
            return;
        }

        var query = new Array();

        var uri = '/user-appliance-reg/users/' + opts.username + '/appliances'

        self.get(uri, query, function (err, data) {
            if (err) {
                return callback(err);
            }

            var parsedData = self.parseJSON(data)
            //var parsedData = JSON.parse(data)
            //debug(parsedData);
            if (parsedData.status === 'ERROR') {
                debug('getTelemCallback() - error parsing JSON: ' + jsonData);
                return callback('JSON parse error', null);
            }
            debug(parsedData);
            self.deviceList = parsedData.data;
            debug(self.deviceList);
            callback(null, parsedData.data);
            return;
        });
    }
}

Frigidaire.prototype.hasAttribute = function (applianceSn, attribute) {
    debug('getValue(attribute: ' + attribute + ')');
    var self = this;

    var applianceIndex = self.getDeviceIndex(applianceSn);

    if (!self.deviceList[applianceIndex].telem) {
        debug('Telementry not defined for sn: ' + applianceSn);
        return false;
    }

    var attr = false;
    for (var i = 0; i < self.deviceList[applianceIndex].telem.length; i++) {
        if (self.deviceList[applianceIndex].telem[i].haclCode == attribute) {
            return true;
        }
    }

    debug('Attribute ' + attribute + ' not found in device telemetry');
    return false;
}

Frigidaire.prototype.getValue = function (applianceSn, attribute, callback, attempt = 0) {
    debug('getValue(attribute: ' + attribute + ')');
    var self = this;

    ++attempt;
    if (attempt > MAX_RETRIES) {
        callback("getValue() - max retries exceeded", null);
        return;
    }

    if (!this.telemPopulated()) {
        debug("getValue() - no telementry, exiting", null);
        return callback("getValue() - no telementry, exiting", null);
    }

    var applianceIndex = self.getDeviceIndex(applianceSn);

    if (!self.deviceList[applianceIndex].telem) {
        var err = new Error('Telementry not defined for sn: ' + applianceSn);
        return callback(err, null);
    }

    try {
        var attr = false;
        for (var i = 0; i < self.deviceList[applianceIndex].telem.length; i++) {
            if (self.deviceList[applianceIndex].telem[i].haclCode == attribute) {
                attr = self.deviceList[applianceIndex].telem[i];
            }
        }

        //debug(attr);
        if (attr === false) {
            err = new Error('Attribute ' + attribute + ' not found in device telemetry');
            return callback(err, null);
        }

        if (attr.haclCode === '0430' || attr.haclCode === '0432') {
            var value = attr.containers[1].numberValue;
        }
        else {
            var value = attr.numberValue;
        }
        debug('applianceSn ' + applianceSn + ' attribute ' + attribute + ' has the value ' + value);
    } catch (e) {
        err = new Error('Error parsking attribute ' + attribute + ' for applianceSn ' + applianceSn + ': ' + e);
        return callback(err, null);
    }
    return callback(null, value);
}

// send commands/actions
Frigidaire.prototype.sendAction = function (applianceObj, attribute, value, callback) {
    var self = this;

    var timestamp = Math.round(Date.now() / 1000)

    var components = []
    var component = { "name": attribute, "value": value }

    if (attribute !== '0432') {
        components.push(component)
    }
    else {
        components = [
            { "name": attribute, "value": "Container" },
            { "name": "1", "value": value },
            { "name": "3", "value": 0 },
            { "name": "0", "value": 1 }
        ]
    }

    var postBody = {
        "timestamp": timestamp,
        "source": "RP1",
        "components": components,
        "operationMode": "EXE",
        "destination": "AC1",
        "version": "ad"
    }

    return this.post(applianceObj, '/commander/remote/sendjson', [], postBody, callback);
};

/**
 * Implemented actions
 **/

Frigidaire.prototype.getMode = function (applianceSn, callback, attempt = 0, frigidaireObj) {
    debug("getMode()");

    ++attempt;
    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }

    if (self.v3api) {
        if (self.authPending == true || !self.deviceList) {
            if (attempt > MAX_RETRIES) {
                debug("getMode() - max retries reached. Not rescheduling.");
                return;
            }
            debug("getMode() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
            setTimeout(self.getMode, SLEEP_TIME, applianceSn, callback, attempt, self);
            //callback(null, {})
            return;
        }


        self.getDeviceV3(applianceSn, attempt, function (applianceObj) {
            if (applianceObj && applianceObj['telem'] && applianceObj['telem']['mode']) {
                switch (applianceObj['telem']['mode']) {
                    case 'COOL':
                        var result = self.MODE_COOL
                        break;
                    case 'ECO':
                        var result = self.MODE_ECON
                        break;
                    case 'FANONLY':
                        var result = self.MODE_FAN
                        break;
                    case 'OFF':
                        var result = self.MODE_OFF
                        break;
                    default:
                        var result = null
                        break;
                }
                return callback(null, result)
            }

        }, self)

    }
    else {
        if (!this.telemPopulated()) {
            //debug(this.deviceList);
            debug("getMode() - no telementry, exiting");
            return callback("getMode() - no telementry, exiting", null);
        }
        var applianceObj = self.getDevice(applianceSn);

        this.getValue(applianceObj.sn, this.MODE, function (err, result) {
            if (err) {
                return callback(err);
            }
            return callback(null, result);
        });
    }
};

Frigidaire.prototype.getApplianceInfo = function (applianceIdArray, callback, attempt = 0, frigidaireObj) {
    debug("getApplianceInfo()");

    ++attempt;
    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }

    if (self.authFailure) {
        debug("authentication failure: " + self.authFailure);
        return callback(self.authFailure);
    }
    else if (self.authPending == true || !self.deviceList) {
        if (attempt > MAX_RETRIES) {
            debug("getCoolingState() - max retries reached. Not rescheduling.");
            return callback('max attempts reached');;
        }
        debug("getCoolingState() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
        setTimeout(self.getCoolingState, SLEEP_TIME, applianceSn, callback, attempt, self);
        //callback(null, {})
        return;
    }

    self.accessToken(function (accessTokenErr, token) {
        if (accessTokenErr) {
            self.authFailure = accessTokenErr
            return callback(accessTokenErr);
        }

        let uri = '/appliance/api/v2/appliances/info'

        request.post({
            url: self.v3httpregionalbaseurl + uri,
            headers: {
                "User-Agent": "Ktor client",
                "Accept": "application/json",
                'content-type': 'application/json',
                'x-api-key': self.v3globalxapikey,
                'Authorization': 'Bearer ' + token.trim()
            },
            json: {
                "applianceIds": applianceIdArray
            },
            strictSSL: false
        }, function (err, response, body) {
            if (err) {
                return callback(err);
            }

            if (Array.isArray(body) && body.length > 0) {
                let applianceInfoObj = {}
                body.map((item, index) => {
                    applianceInfoObj[applianceIdArray[index]] = body[index]
                })

                self.applianceInfo = applianceInfoObj

                return callback(null, applianceInfoObj)

            }
            else {
                return callback(null, [])
            }
        })
    })
}

Frigidaire.prototype.getCoolingState = function (applianceSn, callback, attempt = 0, frigidaireObj) {
    debug("getCoolingState()");

    ++attempt;
    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }

    if (self.v3api) {
        if (self.authFailure) {
            debug("authentication failure: " + self.authFailure);
            return;
        }
        else if (self.authPending == true || !self.deviceList) {
            if (attempt > MAX_RETRIES) {
                debug("getCoolingState() - max retries reached. Not rescheduling.");
                return;
            }
            debug("getCoolingState() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
            setTimeout(self.getCoolingState, SLEEP_TIME, applianceSn, callback, attempt, self);
            //callback(null, {})
            return;
        }

        self.getDeviceV3(applianceSn, attempt, function (applianceObj) {
            debug("getting cooling state for " + applianceObj.sn);

            if (applianceObj && applianceObj['telem'] && applianceObj['telem']['applianceState']) {
                if (applianceObj['telem']['applianceState'] == 'RUNNING') {
                    var result = self.COOLINGSTATE_ON
                }
                else {
                    var result = self.COOLINGSTATE_OFF
                }
                return callback(null, result)
            }
        })
    }
    else {
        if (attempt > MAX_RETRIES) {
            callback("getCoolingState() - max retries exceeded", null);
            return;
        }

        if (!this.telemPopulated()) {
            debug("getCoolingState() - no telementry, exiting");
            return callback("getCoolingState() - no telementry, exiting", null);
        }

        var applianceObj = this.getDevice(applianceSn);

        debug("getting cooling state for " + applianceObj.sn);
        this.getValue(applianceObj.sn, this.COOLINGSTATE, function (err, result) {
            if (err) {
                return callback(err);
            }
            return callback(null, result);
        });
    }
};

Frigidaire.prototype.mode = function (applianceSn, mode, callback, attempt = 0, frigidaireObj) {
    debug("mode()");

    ++attempt;

    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }

    if (self.v3api) {
        if (self.authFailure) {
            console.error("authentication failure: " + self.authFailure);
            return;
        }
        else if (self.authPending == true || !self.deviceList) {
            if (attempt > MAX_RETRIES) {
                console.error("mode() - max retries reached. Not rescheduling.");
                return;
            }
            debug("mode() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
            setTimeout(self.mode, SLEEP_TIME, applianceSn, mode, callback, attempt, self);
            //callback(null, {})
            return;
        }

        var applianceObj = self.getDevice(applianceSn);

        debug("setting mode to " + mode + " for appliance " + applianceObj.sn);

        if (applianceObj && applianceObj['fullId']) {
            var v3Mode = null

            switch (mode) {
                case 0:
                    v3Mode = 'OFF';
                    break;
                case 1:
                    v3Mode = 'COOL';
                    break;
                case 3:
                    v3Mode = 'FANONLY';
                    break;
                case 4:
                    v3Mode = 'ECO';
                    break;
                default:
                    break;
            }

            return self.v3sendAction(callback, applianceObj['fullId'], attempt, 'mode', v3Mode, frigidaireObj)
        }
    }
    else {
        if (attempt > MAX_RETRIES) {
            callback("mode() - max retries exceeded", null);
            return;
        }

        if (!this.telemPopulated()) {
            debug("mode() - no telementry, exiting");
            return callback("mode() - no telementry, exiting", null);
        }

        var applianceObj = this.getDevice(applianceSn);

        debug("changing mode to " + mode);
        this.sendAction(applianceObj, this.MODE, mode, callback);
    }
};

Frigidaire.prototype.getUnit = function (applianceSn, callback, attempt = 0, frigidaireObj) {
    debug("getUnit()");
    var self = this;

    ++attempt;
    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }

    if (self.v3api) {
        if (self.authFailure) {
            debug("authentication failure: " + self.authFailure);
            return;
        }
        else if (self.authPending == true || !self.deviceList) {
            if (attempt > MAX_RETRIES) {
                debug("getUnit() - max retries reached. Not rescheduling.");
                return;
            }
            debug("getUnit() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
            setTimeout(self.getUnit, SLEEP_TIME, applianceSn, callback, attempt, self);
            //callback(null, {})
            return;
        }

        self.getDeviceV3(applianceSn, attempt, function (applianceObj) {
            debug("getting temperature unit for " + applianceObj.sn);

            if (applianceObj && applianceObj['telem'] && applianceObj['telem']['temperatureRepresentation']) {
                if (applianceObj['telem']['temperatureRepresentation'] == 'FAHRENHEIT') {
                    var result = self.FAHRENHEIT
                }
                else {
                    var result = self.CELSIUS
                }
                return callback(null, result)
            }
        })
    }
    else {
        if (attempt > MAX_RETRIES) {
            callback("getUnit() - max retries exceeded", null);
            return;
        }

        if (!this.telemPopulated()) {
            debug("getUnit() - no telementry, exiting");
            return callback("getUnit() - no telementry, exiting", null);
        }

        var applianceObj = this.getDevice(applianceSn);

        debug("getting units for " + applianceObj.sn);
        this.getValue(applianceObj.sn, this.UNIT, function (err, result) {
            if (err) {
                return callback(err);
            }
            return callback(null, result);
        });
    }
};

Frigidaire.prototype.changeUnits = function (applianceSn, unit, callback, attempt = 0, frigidaireObj) {
    debug("changeUnits()");

    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }

    ++attempt;
    if (self.v3api) {
        if (self.authFailure) {
            debug("authentication failure: " + self.authFailure);
            return;
        }
        else if (self.authPending == true || !self.deviceList) {
            if (attempt > MAX_RETRIES) {
                debug("changeUnits() - max retries reached. Not rescheduling.");
                return;
            }
            debug("changeUnits() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
            setTimeout(self.changeUnits, SLEEP_TIME, applianceSn, unit, callback, attempt, self);
            //callback(null, {})
            return;
        }

        var applianceObj = self.getDevice(applianceSn);

        debug("changing units for " + applianceObj.sn + " to " + unit);

        if (applianceObj && applianceObj['fullId']) {
            var v3Unit = null

            switch (unit) {
                case 0:
                    v3Unit = 'CELSIUS';
                    break;
                case 1:
                    v3Unit = 'FAHRENHEIT';
                    break;
                default:
                    break;
            }

            return self.v3sendAction(callback, applianceObj['fullId'], attempt, 'temperatureRepresentation', v3Unit, frigidaireObj)
        }
    }
    else {
        if (attempt > MAX_RETRIES) {
            callback("changeUnits() - max retries exceeded", null);
            return;
        }

        if (!this.telemPopulated()) {
            debug("changeUnits() - no telementry, exiting");
            return callback("changeUnits() - no telementry, exiting", null);
        }

        var applianceObj = this.getDevice(applianceSn);

        debug("changing units for " + applianceObj.sn + " to " + unit);
        this.sendAction(applianceObj, this.UNIT, unit, callback);
    }
};

Frigidaire.prototype.getCleanAir = function (applianceSn, callback, attempt = 0, frigidaireObj) {
    debug("getCleanAir()");
    ++attempt;

    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }

    if (self.v3api) {
        if (self.authFailure) {
            debug("authentication failure: " + self.authFailure);
            return;
        }
        else if (self.authPending == true || !self.deviceList) {
            if (attempt > MAX_RETRIES) {
                debug("getCleanAir() - max retries reached. Not rescheduling.");
                return;
            }
            debug("getCleanAir() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
            setTimeout(self.getCleanAir, SLEEP_TIME, applianceSn, callback, attempt, self);
            //callback(null, {})
            return;
        }

        self.getDeviceV3(applianceSn, attempt, function (applianceObj) {

            debug("getting clean air status for " + applianceObj.sn);

            if (applianceObj && applianceObj['telem'] && applianceObj['telem']['cleanAirMode']) {
                if (applianceObj['telem']['cleanAirMode'] == 'ON') {
                    var result = self.CLEANAIR_ON
                }
                else {
                    var result = self.CLEANAIR_OFF
                }
                return callback(null, result)
            }
        })
    }
    else {
        if (attempt > MAX_RETRIES) {
            callback("getCleanAir() - max retries exceeded", null);
            return;
        }

        if (!this.telemPopulated()) {
            debug("getCleanAir() - no telementry, exiting");
            return callback("getCleanAir() - no telementry, exiting", null);
        }

        var applianceObj = this.getDevice(applianceSn);

        if (!this.hasAttribute(applianceSn, this.CLEANAIR)) {
            debug("cleanAir() - No clean air attirbute, exiting gracefully...");
            return callback(null, this.CLEANAIR_OFF);
        }

        debug("getting clean air status for " + applianceObj.sn);
        this.getValue(applianceObj.sn, this.CLEANAIR, function (err, result) {
            if (err) {
                return callback(err);
            }
            return callback(null, result);
        });
    }
};

Frigidaire.prototype.cleanAir = function (applianceSn, mode, callback, attempt = 0, frigidaireObj) {
    debug("cleanAir()");
    var self = this;

    ++attempt;
    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }

    if (self.v3api) {
        if (self.authFailure) {
            debug("authentication failure: " + self.authFailure);
            return;
        }
        else if (self.authPending == true || !self.deviceList) {
            if (attempt > MAX_RETRIES) {
                debug("cleanAir() - max retries reached. Not rescheduling.");
                return;
            }
            debug("cleanAir() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
            setTimeout(self.cleanAir, SLEEP_TIME, applianceSn, mode, callback, attempt, self);
            //callback(null, {})
            return;
        }

        var applianceObj = self.getDevice(applianceSn);

        debug("changing clean air for " + applianceObj.sn + " to " + mode);

        if (applianceObj && applianceObj['fullId']) {
            var v3Mode = null

            switch (mode) {
                case 0:
                    v3Mode = 'OFF';
                    break;
                case 1:
                    v3Mode = 'ON';
                    break;
                default:
                    break;
            }

            return self.v3sendAction(callback, applianceObj['fullId'], attempt, 'cleanAirMode', v3Mode, frigidaireObj)
        }
    }
    else {
        if (attempt > MAX_RETRIES) {
            callback("cleanAir() - max retries exceeded", null);
            return;
        }

        if (!this.telemPopulated()) {
            debug("cleanAir() - no telementry, exiting");
            return callback("cleanAir() - no telementry, exiting", null);
        }

        var applianceObj = this.getDevice(applianceSn);

        if (!this.hasAttribute(applianceSn, this.CLEANAIR)) {
            debug("cleanAir() - No clean air attirbute, exiting gracefully...");
            return callback(null, this.CLEANAIR_OFF);
        }

        debug("changing clean air for " + applianceObj.sn + " to " + mode);
        this.sendAction(applianceObj, this.CLEANAIR, mode, callback);
    }
};

Frigidaire.prototype.getFilter = function (applianceSn, callback, attempt = 0, frigidaireObj) {
    debug("getFilter()");

    ++attempt;
    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }

    if (self.v3api) {
        if (self.authPending == true || !self.deviceList) {
            if (attempt > MAX_RETRIES) {
                debug("getFilter() - max retries reached. Not rescheduling.");
                return;
            }
            debug("getFilter() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
            setTimeout(self.getFilter, SLEEP_TIME, applianceSn, callback, attempt, self);
            //callback(null, {})
            return;
        }

        self.getDeviceV3(applianceSn, attempt, function (applianceObj) {

            debug("getting filter attribute for " + applianceObj.sn);

            if (applianceObj && applianceObj['telem'] && applianceObj['telem']['filterState']) {
                switch (applianceObj['telem']['filterState']) {
                    case 'BUY':
                        var result = self.FILTER_CHANGE
                        break;
                    case 'CHANGE':
                        var result = self.FILTER_CHANGE
                        break;
                    case 'CLEAN':
                        var result = self.FILTER_CHANGE
                        break;
                    case 'GOOD':
                        var result = self.FILTER_GOOD
                        break;
                    default:
                        var result = null
                        break;
                }
                return callback(null, result)
            }
        })
    }
    else {
        if (attempt > MAX_RETRIES) {
            callback("getFilter() - max retries exceeded", null);
            return;
        }

        if (!this.telemPopulated()) {
            debug("getFilter() - no telementry, exiting");
            return callback("getFilter() - no telementry, exiting", null);
        }

        var applianceObj = this.getDevice(applianceSn);

        if (!this.hasAttribute(applianceSn, this.FILTER)) {
            debug("getFilter() - No filter attirbute, exiting gracefully...");
            return callback(null, this.FILTER_GOOD);
        }

        debug("getting filter status for " + applianceObj.sn);
        this.getValue(applianceObj.sn, this.FILTER, function (err, result) {
            if (err) {
                return callback(err);
            }
            return callback(null, result);
        });
    }
};

Frigidaire.prototype.fanMode = function (applianceSn, mode, callback, attempt = 0, frigidaireObj) {
    debug("fanMode()");

    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }

    ++attempt;
    if (self.v3api) {
        if (self.authFailure) {
            debug("authentication failure: " + self.authFailure);
            return;
        }
        else if (self.authPending == true || !self.deviceList) {
            if (attempt > MAX_RETRIES) {
                debug("fanMode() - max retries reached. Not rescheduling.");
                return;
            }
            debug("fanMode() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
            setTimeout(self.fanMode, SLEEP_TIME, applianceSn, mode, callback, attempt, self);
            //callback(null, {})
            return;
        }

        var applianceObj = self.getDevice(applianceSn);

        debug("changing fan speed for " + applianceObj.sn + " to " + mode);

        if (applianceObj && applianceObj['fullId']) {
            var v3Mode = null

            switch (mode) {
                case 1:
                    v3Mode = 'LOW';
                    break;
                case 2:
                    v3Mode = 'MIDDLE';
                    break;
                case 4:
                    v3Mode = 'HIGH';
                    break;
                case 7:
                    v3Mode = 'AUTO';
                    break;
                default:
                    break;
            }

            return self.v3sendAction(callback, applianceObj['fullId'], attempt, 'fanSpeedSetting', v3Mode, frigidaireObj)
        }
    }
    else {
        if (attempt > MAX_RETRIES) {
            callback("fanMode() - max retries exceeded", null);
            return;
        }

        if (!this.telemPopulated()) {
            debug("fanMode() - no telementry, exiting");
            return callback("fanMode() - no telementry, exiting", null);
        }

        var applianceObj = this.getDevice(applianceSn);

        debug("changing fan speed for " + applianceObj.sn + " to " + mode);
        this.sendAction(applianceObj, this.FANMODE, mode, callback);
    }
};

Frigidaire.prototype.getFanMode = function (applianceSn, callback, attempt = 0, frigidaireObj) {
    debug("getFanMode()");

    ++attempt;
    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }

    if (self.v3api) {
        if (self.authPending == true || !self.deviceList) {
            if (attempt > MAX_RETRIES) {
                debug("getFanMode() - max retries reached. Not rescheduling.");
                return;
            }
            debug("getFanMode() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
            setTimeout(self.getFanMode, SLEEP_TIME, applianceSn, callback, attempt, self);
            //callback(null, {})
            return;
        }

        self.getDeviceV3(applianceSn, attempt, function (applianceObj) {

            debug("getting fan mode for " + applianceObj.sn);

            if (applianceObj && applianceObj['telem'] && applianceObj['telem']['fanSpeedSetting']) {
                switch (applianceObj['telem']['fanSpeedSetting']) {
                    case 'AUTO':
                        var result = self.FANMODE_AUTO
                        break;
                    case 'HIGH':
                        var result = self.FANMODE_HIGH
                        break;
                    case 'LOW':
                        var result = self.FANMODE_LOW
                        break;
                    case 'MIDDLE':
                        var result = self.FANMODE_MED
                        break;
                    default:
                        var result = null
                        break;
                }
                return callback(null, result)
            }
        })
    }
    else {
        if (attempt > MAX_RETRIES) {
            callback("getFanMode() - max retries exceeded", null);
            return;
        }

        if (!this.telemPopulated()) {
            debug("getFanMode() - no telementry, exiting");
            return callback("getFanMode() - no telementry, exiting", null);
        }

        var applianceObj = this.getDevice(applianceSn);

        debug("getting fan mode for " + applianceObj.sn);
        this.getValue(applianceObj.sn, this.FANMODE, function (err, result) {
            if (err) {
                return callback(err);
            }
            return callback(null, result);
        });
    }
};

Frigidaire.prototype.setTemp = function (applianceSn, temp, callback, attempt = 0, frigidaireObj) {
    debug("setTemp()");

    ++attempt;
    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }

    if (self.v3api) {
        if (self.authFailure) {
            debug("authentication failure: " + self.authFailure);
            return;
        }
        else if (self.authPending == true || !self.deviceList) {
            if (attempt > MAX_RETRIES) {
                debug("setTemp() - max retries reached. Not rescheduling.");
                return;
            }
            debug("setTemp() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
            setTimeout(self.setTemp, SLEEP_TIME, applianceSn, temp, callback, attempt, self);
            //callback(null, {})
            return;
        }

        self.getDeviceV3(applianceSn, attempt, function (applianceObj) {

            debug("changing temp for " + applianceObj.sn + " to " + temp);

            if (applianceObj && applianceObj['fullId'] && applianceObj['telem'] && applianceObj['telem']['temperatureRepresentation']) {
                var tempCommandName = null

                switch (applianceObj['telem']['temperatureRepresentation']) {
                    case 'CELSIUS':
                        tempCommandName = 'targetTemperatureC';
                        break;
                    case 'FAHRENHEIT':
                        tempCommandName = 'targetTemperatureF';
                        break;
                    default:
                        break;
                }

                return self.v3sendAction(callback, applianceObj['fullId'], attempt, tempCommandName, Number(temp), frigidaireObj)
            }
        }, self)
    }
    else {
        if (attempt > MAX_RETRIES) {
            callback("setTemp() - max retries exceeded", null);
            return;
        }

        if (!this.telemPopulated()) {
            debug("setTemp() - no telementry, exiting");
            return callback("setTemp() - no telementry, exiting", null);
        }

        var applianceObj = this.getDevice(applianceSn);

        debug("changing temp for " + applianceObj.sn + " to " + temp);
        this.sendAction(applianceObj, this.SETPOINT, Math.round(temp), callback);
    }
};

Frigidaire.prototype.getTemp = function (applianceSn, callback, attempt = 0, frigidaireObj) {
    debug("getTemp()");

    ++attempt;
    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }

    if (self.v3api) {
        if (self.authPending == true || !self.deviceList) {
            if (attempt > MAX_RETRIES) {
                debug("getTemp() - max retries reached. Not rescheduling.");
                return;
            }
            debug("getTemp() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
            setTimeout(self.getTemp, SLEEP_TIME, applianceSn, callback, attempt, self);
            //callback(null, {})
            return;
        }

        self.getDeviceV3(applianceSn, attempt, function (applianceObj) {

            debug("getting temp for " + applianceObj.sn);

            if (applianceObj && applianceObj['telem'] && applianceObj['telem']['temperatureRepresentation'] && applianceObj['telem']['targetTemperatureF'] && applianceObj['telem']['targetTemperatureC']) {
                switch (applianceObj['telem']['temperatureRepresentation']) {
                    case 'FAHRENHEIT':
                        var result = applianceObj['telem']['targetTemperatureF']
                        break;
                    case 'CELSIUS':
                        var result = applianceObj['telem']['targetTemperatureC']
                        break;
                    default:
                        var result = null
                        break;
                }
                return callback(null, result)
            }
            else {
                return callback('error: no temperature attribute found in telemetry')
            }
        })
    }
    else {
        if (attempt > MAX_RETRIES) {
            callback("getTemp() - max retries exceeded", null);
            return;
        }

        if (!this.telemPopulated()) {
            debug("getTemp() - no telementry, exiting");
            return callback("getTemp() - no telementry, exiting", null);
        }

        var applianceObj = this.getDevice(applianceSn);

        debug("getting temp for " + applianceObj.sn);
        this.getValue(applianceObj.sn, this.SETPOINT, function (err, result) {
            if (err) {
                return callback(err);
            }
            return callback(null, result);
        });
    }
};

Frigidaire.prototype.getRoomTemp = function (applianceSn, callback, attempt = 0, frigidaireObj) {
    debug("getRoomTemp()");

    ++attempt;
    if (frigidaireObj) {
        var self = frigidaireObj;
    }
    else {
        var self = this
    }

    if (self.v3api) {
        if (self.authPending == true || !self.deviceList) {
            if (attempt > MAX_RETRIES) {
                debug("getRoomTemp() - max retries reached. Not rescheduling.");
                return;
            }
            debug("getRoomTemp() - auth is pending, rescheduling this call in " + SLEEP_TIME + "ms");
            setTimeout(self.getTemp, SLEEP_TIME, applianceSn, callback, attempt, self);
            //callback(null, {})
            return;
        }

        self.getDeviceV3(applianceSn, attempt, function (applianceObj) {

            debug("getting temp for " + applianceObj.sn);

            if (applianceObj && applianceObj['telem'] && applianceObj['telem']['temperatureRepresentation'] && applianceObj['telem']['ambientTemperatureF'] && applianceObj['telem']['ambientTemperatureC']) {
                switch (applianceObj['telem']['temperatureRepresentation']) {
                    case 'FAHRENHEIT':
                        var result = applianceObj['telem']['ambientTemperatureF']
                        break;
                    case 'CELSIUS':
                        var result = applianceObj['telem']['ambientTemperatureC']
                        break;
                    default:
                        var result = null
                        break;
                }
                return callback(null, result)
            }
            else {
                return callback('error: no ambient/room temperature attribute found in telemetry')
            }
        })
    }
    else {
        if (attempt > MAX_RETRIES) {
            callback("getRoomTemp() - max retries exceeded", null);
            return;
        }

        if (!this.telemPopulated()) {
            debug("getRoomTemp() - no telementry, exiting");
            return callback("getRoomTemp() - no telementry, exiting", null);
        }

        var applianceObj = this.getDevice(applianceSn);

        if (this.disableTemp)
            return callback(null, undefined);

        debug("getting room temp for " + applianceObj.sn);
        this.getValue(applianceObj.sn, this.TEMP, function (err, result) {
            if (err) {
                return callback(err);
            }
            return callback(null, result);
        });
    }
};

module.exports = Frigidaire;

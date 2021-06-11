/**
 * Frigidaire Appliance Node.js Module
 *
 * Author Karl Grindley <@karlg100>
 *
 * Todo ?
 *
 */

 'use strict';

 var debug = require('debug')('frigidaire');
 var extend = require('xtend');
 var request = require('request');
 var randomstring = require('randomstring');
 
 // Constants
 var DEFAULT_TIMEOUT = 60000;
 var DEVICE_COMMAND_TIMEOUT = 60000;
 var TWO_MIN_TIMEOUT = 120000;
 var THREE_MIN_TIMEOUT = 180000;
 var DEVICE_OUTLOOK_TIMEOUT = 60000;
 var FIVE_MIN_TIMEOUT = 300000;
 
 var SEND_REQUEST = true;
 
 // New vars
 var opts = {};
 
 var defaults = {
     username: null,
     password: null,
     apiUrl: 'https://api.latam.ecp.electrolux.com'
 };
 
 function Frigidaire(options) {
     if (!(this instanceof Frigidaire)) {
         return new Frigidaire(options);
     }
 
     opts = extend(defaults, options);
 
     this.loginData = null;
     this.appVersion = opts.appVersion || "4.0.2";
     this.clientId = opts.clientId || "e9c4ac73-e94e-4b37-b1fe-b956f568daa0";
     this.userAgent = opts.userAgent || 'Frigidaire/81 CFNetwork/1121.2.2 Darwin/19.2.0';
     this.basicAuthToken = opts.basicAuthToken || 'dXNlcjpwYXNz';
     this.deviceId = opts.deviceId || null;
     this.country = opts.country || 'US';
     this.brand = opts.brand || 'Frigidaire';
     this.applianceName = opts.applianceName;
     this.instanceId = opts.instanceId || null;
     this.sessionId = opts.sessionId || null;
     this.deviceToken = opts.deviceToken || null;
     this.applianceId = opts.applianceId || null;
     this.applianceSn = opts.applianceSerial || null;
     this.pollingInterval = opts.pollingInterval || 10000; // default to 10 seconds, so we don't hammer their servers
     this.disableTemp = opts.disableTemp || false;
     this.attempts = 0;
     this.deviceList = null;
     this.telem = null;
     this.lastUpdate = null;
     this.updateTimer = [];
     this.deviceIndex = opts.deviceIndex || 0;
     this.stage = false;
     this.getBusy = false;
     this.postBusy = false;  // global lock for get requests.  Slow them down as simultanious requests are tripping over
 
     // attributes
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
 }
 
 Frigidaire.prototype.set = function (name, value) {
     opts[name] = value;
 };
 
 // generates random string in format ........-....-....-....-............ using upercase hex
 Frigidaire.prototype.generateId = function () {
     return randomstring.generate({ length: 8, charset: 'hex' }).toUpperCase() + '-' +
         randomstring.generate({ length: 4, charset: 'hex' }).toUpperCase() + '-' +
         randomstring.generate({ length: 4, charset: 'hex' }).toUpperCase() + '-' +
         randomstring.generate({ length: 4, charset: 'hex' }).toUpperCase() + '-' +
         randomstring.generate({ length: 12, charset: 'hex' }).toUpperCase();
 }
 
 Frigidaire.prototype.stripJSON = function (dirtyString) {
     var trimmed = dirtyString.replace(/\/\*\-secure\-\n/, '').replace(/\*\/$/, '');
     try {
         var parsed = JSON.parse(trimmed);
         //debug(parsed);
         return parsed;
     } catch (e) {
         // we failed to parse the JSON, try again?
         console.error("failed to parse json: '" + body + "'");
         debug('trimmed body: ' + trimmedBody);
     }
 }
 
 /**
  * New implementations (port of Colt JS)
  */
 //Frigidaire.prototype.get = function(endpoint, args, callback, retry = true, dataType, timeout) {
 Frigidaire.prototype.get = function (endpoint, args, callback, retry = true, dataType = 'json', timeout = DEFAULT_TIMEOUT) {
 
     debug('get()');
 
     var self = this;
 
     if (self.getBusy) {
         if (retry != true) {
             debug("get is already running, and told not to retry, exiting...");
             return callback(new Error('get is already running, and told not to retry, exiting...'));
         }
         var sleepTime = Math.floor(Math.random() * Math.floor(500));
         //var sleepTime = 1000;
         debug("get already running, sleeping for " + sleepTime);
         return setTimeout(function () { self.get(endpoint, args, callback, retry, dataType, timeout) }, sleepTime);
     } else
         self.getBusy = true;
 
     //dataType = dataType || 'json';
     //timeout  = timeout || DEFAULT_TIMEOUT;
 
     if (!self.sessionId) {
         debug('no sessionId, starting auth sequence');
         self.getBusy = false;
         self.authStage1({
             username: opts.username,
             password: opts.password
         }, function authStg1GetCallback(err, response) {
             if (err) {
                 return callback(err);
             }
             //console.log(response)
             //self.sessionId = response
             return self.get(endpoint, args, callback, retry, dataType, timeout);
 
         });
     }
 
 
     var query = {};
 
     for (var key in args) {
         if (typeof args[key] == 'string') {
             args[key] = args[key].replace(/[\\\']/g, '');
         }
 
         //form[key] = encodeURIComponent(args[key]);
         query[key] = args[key];
     }
 
     //query['isAjaxRequest'] = 'true';
     //query['x'] = 0.2348377558393847;
 
     var url = opts.apiUrl + endpoint + args.join('/');
     var headers = {
         'x-ibm-client-id': this.clientId,
         'User-Agent': this.userAgent,
         'Content-Type': 'application/json',
         'Authorization': 'Basic ' + this.basicAuthToken
     }
 
     var query = []
 
     if (this.sessionId)
         headers['session_token'] = this.sessionId;
 
     if (this.applianceObj) {
         var urlQueryString = "?pnc=" + this.applianceObj.pnc + "&elc=" + this.applianceObj.elc + "&sn=" + this.applianceObj.sn + "&mac=" + this.applianceObj.mac;
         url = url + urlQueryString
     }
 
     //debug('url: %s', url);
     //debug('headers: %s', headers);
     //debug('form: %s', form);
     debug('attempts: %s', self.attempts);
 
     if (this.sessionId) {
         if ('undefined' === typeof SEND_REQUEST || SEND_REQUEST) {
             request.get({ url: url, headers: headers, parameters: query, jar: true, strictSSL: false }, function (err, response, body) {
 
                 //debug(body)
 
                 var jsonResponse = JSON.parse(body)
                 if (jsonResponse.status === 'ERROR' && jsonResponse.code === 'ECP0105') {
                     debug("Received error ECP0105 indicating bad session token. Clearing token and trying again...")
                     self.sessionId = null;
                     self.getBusy = false;
                     return self.get(endpoint, args, callback, retry, dataType, timeout)
                 }
 
                 //debug("testing for maximum retries");
                 if (self.attempts >= 3) {
                     err = new Error('maximum retries, giving up.');
                     self.attempts = 0;
                     self.getBusy = false;
                     return callback(err);
                 }
 
                 ++self.attempts;
 
                 //debug("testing for response");
                 if (!response) {
                     // something hung up in the SSL or TCP connect session.  try again.
                     console.log('no response, retry!');
                     self.getBusy = false;
                     return self.get(endpoint, args, callback, retry, dataType, timeout);
                 }
 
                 //debug("testing for errors");
                 if (!err && response.statusCode != 200) {
                     err = new Error(response.statusCode + ' ' + response.statusMessage);
                 }
 
                 if (err) {
                     debug("Error " + response.statusCode + " : " + response.statusMessage);
                     self.getBusy = false;
                     return callback(err);
                 }
 
                 //debug("reseting attempts");
                 self.attempts = 0;
 
                 //debug("everything good, callback time");
                 self.getBusy = false;
                 return callback(null, body);
             });
         }
     }
 }
 
 Frigidaire.prototype.post = function (endpoint, args, body, callback, authPost = false, retry = true, dataType = 'json', timeout = DEFAULT_TIMEOUT) {
 
     debug('post()');
 
     var self = this;
 
     if (self.postBusy) {
         if (retry != true) {
             debug("post is already running, and told not to retry, exiting...");
             return callback(new Error('post is already running, and told not to retry, exiting...'));
         }
         var sleepTime = Math.floor(Math.random() * Math.floor(500));
         //var sleepTime = 1000;
         debug("post already running, sleeping for " + sleepTime);
         return setTimeout(function () { self.post(endpoint, args, body, callback, retry, dataType, timeout) }, sleepTime);
     } else
         self.postBusy = true;
 
     //dataType = dataType || 'json';
     //timeout  = timeout || DEFAULT_TIMEOUT;
 
     if (!self.sessionId && authPost != true) {
         debug('no sessionId, starting auth sequence');
         self.postBusy = false;
         return self.authStage1({
             username: opts.username,
             password: opts.password
         }, function (err, response) {
             if (err) {
                 return callback(err);
             }
             return self.post(endpoint, args, body, callback, retry, dataType, timeout);
 
         });
     }
 
     var url = opts.apiUrl + endpoint + args.join('/');
     var headers = {
         'x-ibm-client-id': this.clientId,
         'User-Agent': this.userAgent,
         'Content-Type': 'application/json',
         'Authorization': 'Basic ' + this.basicAuthToken
     }
 
     if (this.sessionId)
         headers['session_token'] = this.sessionId;
 
     if (this.applianceObj) {
         var urlQueryString = "?pnc=" + this.applianceObj.pnc + "&elc=" + this.applianceObj.elc + "&sn=" + this.applianceObj.sn + "&mac=" + this.applianceObj.mac;
         url = url + urlQueryString
     }
 
     //debug('url: %s', url);
     //debug('headers: %s', headers);
     //debug('form: %s', form);
     debug('attempts: %s', self.attempts);
 
     if ('undefined' === typeof SEND_REQUEST || SEND_REQUEST) {
         request.post({ url: url, headers: headers, json: body, strictSSL: false },
             function postResponseCallback(err, response, body) {
 
                 debug(body)
 
                 //debug("testing for maximum retries");
                 if (self.attempts >= 3) {
                     err = new Error('maximum retries, giving up.');
                     self.attempts = 0;
                     self.postBusy = false;
                     return callback(err);
                 }
 
                 ++self.attempts;
 
                 //debug("testing for response");
                 if (!response) {
                     // something hung up in the SSL or TCP connect session.  try again.
                     console.log('no response, retry!');
                     self.postBusy = false;
                     return self.post(endpoint, args, callback, retry, dataType, timeout);
                 }
 
                 //debug("get() : statusCode - "+response.statusCode);
                 //debug("get() : body - "+body);
                 //debug("get() : callback - "+callback);
 
                 //debug("testing for expired session");
                 if (response.statusCode == 401 && self.stage != 1) {
                     // we were authenticated, now we are not.  reset everything and start over
                     debug('we lost our auth, reset everything and retry');
                     self.attempts = 0;
                     self.resetAll();
                     self.getBusy = false;
                     return self.get(endpoint, args, callback, retry, dataType, timeout);
                 }
 
                 //debug("testing for 401 init");
                 if (response.statusCode == 401 && self.stage == 1) {
                     self.postBusy = false;
                     return callback(null, body);
                 } /* else if (response.statusCode == 400 && self.attempts < 3) {
                       self.sessionId = null;
               
                       return self.get(endpoint, args, callback, retry, dataType, timeout);
                     } */
 
                 //debug("testing for errors");
                 if (!err && response.statusCode != 200) {
                     err = new Error(response.statusCode + ' ' + response.statusMessage);
                 }
 
                 if (err) {
                     debug("Error " + response.statusCode + " : " + response.statusMessage);
                     self.postBusy = false;
                     return callback(err);
                 }
 
                 //debug("reseting attempts");
                 self.attempts = 0;
 
                 //debug("everything good, callback time");
                 self.postBusy = false;
                 return callback(null, body);
             });
     }
 }
 
 function postResponseCallback(err, response, body) {
 
     //debug("testing for maximum retries");
     if (self.attempts >= 3) {
         err = new Error('maximum retries, giving up.');
         self.attempts = 0;
         self.getBusy = false;
         return callback(err);
     }
 
     ++self.attempts;
 
     //debug("testing for response");
     if (!response) {
         // something hung up in the SSL or TCP connect session.  try again.
         console.log('no response, retry!');
         self.getBusy = false;
         return self.get(endpoint, args, callback, retry, dataType, timeout);
     }
 
     //debug("get() : statusCode - "+response.statusCode);
     //debug("get() : body - "+body);
     //debug("get() : callback - "+callback);
 
     //debug("testing for expired session");
     if (response.statusCode == 401 && self.stage != 1) {
         // we were authenticated, now we are not.  reset everything and start over
         debug('we lost our auth, reset everything and retry');
         self.attempts = 0;
         self.resetAll();
         self.getBusy = false;
         return self.get(endpoint, args, callback, retry, dataType, timeout);
     }
 
     //debug("testing for 401 init");
     if (response.statusCode == 401 && self.stage == 1) {
         self.getBusy = false;
         return callback(null, body);
     } /* else if (response.statusCode == 400 && self.attempts < 3) {
           self.sessionId = null;
   
           return self.get(endpoint, args, callback, retry, dataType, timeout);
         } */
 
     //debug("testing for errors");
     if (!err && response.statusCode != 200) {
         err = new Error(response.statusCode + ' ' + response.statusMessage);
     }
 
     if (err) {
         debug("Error " + response.statusCode + " : " + response.statusMessage);
         self.getBusy = false;
         return callback(err);
     }
 
     //debug("reseting attempts");
     self.attempts = 0;
 
     //debug("everything good, callback time");
     self.getBusy = false;
     return callback(null, body);
 }
 
 Frigidaire.prototype.resetAll = function () {
     debug("resetAll()");
     //this.updateTimer.forEach(function (timer) {
     //clearInterval(timer);
     //});
     //this.updateTimer = [];
     this.loginData = null;
     this.deviceList = null;
     this.instanceId = null;
     this.deviceToken = null;
     this.sessionId = null;
     this.lastUpdate = null;
     //this.telem = null;    // keep telemetry, this will keep the HomeKit updates from constantly retrying
     //this.deviceList = null;
     this.sessionPending = false;
     this.stage = false;
     request.jar();
 }
 
 Frigidaire.prototype.scheduleUpdates = function (callback) {
     var self = this;
 
     debug("scheduling callbacks....");
 
     var sleepTime = self.pollingInterval + Math.floor(Math.random() * Math.floor(500)); // we need some randomness, otherwise one will always fail to run
     //var timer = setInterval(function(){ self.getTelemUpdate(applianceId, callback); }, sleepTime);
     var timer = setInterval(function () { self.getTelem(callback); }, sleepTime);
     self.updateTimer.push(timer);
 }
 
 Frigidaire.prototype.callbackHandler = function (err, data) {
     if (err) {
         debug('callbackHandler : error - ' + err);
         return null;
     }
     debug('callbackHandler : success');
     return null;
 }
 
 function getSessionToken(credentials) {
     var self = this;
     debug("getSessionToken()");
     self.stage = 1;
 
     if (!credentials.username) {
         return callback(new Error('Missing parameter \'username\''));
     }
 
     if (!credentials.password) {
         return callback(new Error('Missing parameter \'password\''));
     }
 
     //this.sessionId = this.generateId();
 
     var headers = {
         'x-ibm-client-id': this.clientId,
         'User-Agent': this.userAgent,
         'Content-Type': 'application/json',
         'Authorization': 'Basic ' + this.basicAuthToken
     }
 
     var authBody = {
         "username": credentials.username,
         "password": credentials.password,
         "brand": this.brand,
         "deviceId": this.deviceId,
         "country": this.country,
     }
 
     var authUrl = opts.apiUrl + '/authentication/authenticate'
 
     request.post({ url: authUrl, headers: headers, json: authBody, strictSSL: false }, function (err, response, body) {
         if (err) {
             debug('auth error');
             self.resetAll();
             return callback(err);
         }
         var json = body;
         try {
             self.sessionId = json.data.sessionKey;
         } catch (e) {
             // we failed to parse the JSON, try again?
             console.error("failed to parse auth result json: '" + data + "'");
         }
 
         //console.log(body.data.sessionKey)
         //return callback(null, body);
         return body.data.sessionKey
 
     })
 
 }
 
 
 Frigidaire.prototype.authStage1 = function authStg1Funct(credentials, callback) {
     var self = this;
     debug("authStage1()");
     self.stage = 1;
 
     if (!credentials.username) {
         return callback(new Error('Missing parameter \'username\''));
     }
 
     if (!credentials.password) {
         return callback(new Error('Missing parameter \'password\''));
     }
 
     //this.sessionId = this.generateId();
 
     var headers = {
         'x-ibm-client-id': this.clientId,
         'User-Agent': this.userAgent,
         'Content-Type': 'application/json',
         'Authorization': 'Basic ' + this.basicAuthToken
     }
 
     var authBody = {
         "username": credentials.username,
         "password": credentials.password,
         "brand": this.brand,
         "deviceId": this.deviceId,
         "country": this.country,
     }
 
     var authUrl = opts.apiUrl + '/authentication/authenticate'
 
     request.post({ url: authUrl, headers: headers, json: authBody, strictSSL: false }, function authPostCallback(err, response, body) {
         if (err) {
             debug('auth error');
             self.resetAll();
             return callback(err);
         }
         var json = body;
 
         if (json.status === 'ERROR' && json.code === 'ECP0108') {
             err = new Error(json.code + ' ' + json.message);
             return callback(err)
         }
 
         try {
             self.sessionId = json.data.sessionKey;
         } catch (e) {
             // we failed to parse the JSON, try again?
             console.error("failed to parse auth result json: '" + data + "'");
         }
 
         var sessionKey = body.data.sessionKey
         //console.log(sessionKey)
         //return callback(null, body);
 
         var applianceToken;
 
         if (!self.applianceSn) {
             self.getDevices(function getDevicesCallback(err, result) {
                 if (err) {
                     console.log('ERROR: ' + err)
                     callback(err, null)
                 }

                 debug(result);
                 self.applianceSn = result[0].sn;
                 self.applianceId = result.appliance_id
                 applianceToken = result
             }
             )
         } else if (!self.applianceId) {
             self.getInfo(function getInfoCallback(err, result) {
                 if (err) {
                     console.log('ERROR: ' + err)
                     callback(err, null)
                 }

                 debug(result);
                 self.applianceId = result.appliance_id
                 applianceToken = result
             }
             )
         }
         var returnObj = { sessionKey: sessionKey, applianceToken: applianceToken }
         debug('acquired new sessionKey: ' + sessionKey)
         return callback(null, returnObj)
     })
 }
 
 Frigidaire.prototype.getInfo = function (callback) {
     var self = this;
     debug('getApplianceInfo()');
     //console.trace("callback : "+callback);
     //var form = new Array();
     //form['realm'] = 'SingleStepAuthRealm';
 
     var uri = '/user-appliance-reg/users/' + opts.username + '/appliances'
 
     self.get(uri, [], function (err, data) {
         if (err) {
             return callback(err);
         }
 
         var applianceArray = JSON.parse(data).data;
         var applianceObj = null
 
         applianceArray.forEach(element => {
             //console.log(element)
             if (element.sn === self.applianceSn) {
                 debug('found appliance match!')
                 applianceObj = element
             }
         });
 
         var err = null;
         if (!applianceObj) {
             err = 'no appliance found! ensure correct serial number entered in config';
             callback(err, {})
         }
 
         self.applianceObj = applianceObj
 
         //return callback(err, applianceObj);
         return callback(err, applianceObj);
     });
 };
 
 Frigidaire.prototype.getTelem = function (callback) {
     var self = this;
     debug('getTelem()');
 
     var callTime = new Date;
 
     var uri = '/elux-ms/appliances/latest'
 
     self.get(uri, [], function (err, data) {
         if (err) {
             return callback(err);
         }
 
         //debug(self.stripJSON(data).resultSet);
         //self.loginData = self.stripJSON(data);
         var jsonData = JSON.parse(data).data;
         self.telem = jsonData
 
         return callback(null, jsonData);
     });
 };
 
 Frigidaire.prototype.getDevices = function (callback) {
     var self = this;
     debug('getDevices()');
     var query = new Array();
     /*
     query['realm'] = 'SingleStepAuthRealm';
     query['adapter'] = 'EluxDatabaseAdapter';
     query['procedure'] = 'getAllApplianceSnapshotData';
     query['parameters'] = '[]';*/
 
     var callTime = new Date;
 
     var uri = '/user-appliance-reg/users/' + opts.username + '/appliances'
 
     self.get(uri, query, function (err, data) {
         if (err) {
             return callback(err);
         }
 
         //debug(self.stripJSON(data).resultSet);
         //self.loginData = self.stripJSON(data);
         self.telem = self.stripJSON(data).resultSet;
         self.lastUpdate = callTime;
 
         var parsedData = JSON.parse(data)
 
         return callback(null, parsedData.data);
     });
 }
 
 Frigidaire.prototype.getValue = function (attribute, callback, skipUpdate = false) {
     var self = this;
 
     debug('getValue(attribute: ' + attribute + ')');
 
     if (typeof attribute == 'function') {
         callback = attribute;
         attribute = applianceId;
         applianceId = this.applianceId;
     }
 
     //debug(self);
 
     if (!self.telem) {
         var err = new Error('Telementry not defined');
         return callback(err, null);
     }
 
     try {
         var attr;
         this.telem.forEach(attrObj => {
             if (attrObj.haclCode === attribute) {
                 attr = attrObj
             }
         })
 
         if (!attr) {
             err = new Error('Attribute ' + attribute + ' not found in device telemetry');
             return callback(err, null);
         }
 
         if (attr.haclCode === '0430' || attr.haclCode === '0432') {
             var value = attr.containers[0].numberValue
         }
         else {
             var value = attr.numberValue;
         }
         //var value = self.telem[self.deviceIndex].SNAPSHOT[attribute].VALUE_INT;
         debug('applianceId ' + this.applianceId + ' attribute ' + attribute + ' has the value ' + value);
     } catch (e) {
         //debug("appliance index: "+self.getIndexByApplianceId(applianceId));
         //debug("applaince telem: "+self.telem[self.getIndexByApplianceId(applianceId)]);
         //debug("applaince snapshot: "+self.telem[self.getIndexByApplianceId(applianceId)].SNAPSHOT);
         //debug("applaince attribute: "+self.telem[self.getIndexByApplianceId(applianceId)].SNAPSHOT[attribute]);
         //debug("applaince attribute value: "+self.telem[self.getIndexByApplianceId(applianceId)].SNAPSHOT[attribute].VALUE_INT);
         err = new Error('Attribute ' + attribute + ' for applianceId ' + this.applianceId + ' not defined');
         return callback(err, null);
     }
     return callback(null, value);
 }
 
 // send commands/actions
 Frigidaire.prototype.sendAction = function (attribute, value, callback) {
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
 
     return this.post('/commander/remote/sendjson', [], postBody, callback);
 };
 
 Frigidaire.getAssetDetail = function (assetId, f, c, g, b) {
     get('device/GetAssetDetail/', [assetId, f, c], g, b, 'json', THREE_MIN_TIMEOUT)
 }
 
 /**
  * Implemented actions
  **/
 
 Frigidaire.prototype.getMode = function (callback) {
 
     if (!this.applianceObj) {
         var err = 'no telemetry found! exiting'
         return callback(err)
     }
 
     debug("getting mode for " + this.applianceId);
     this.getValue(this.MODE, function (err, result) {
         if (err) {
             return callback(err);
         }
         return callback(null, result);
     });
 };
 
 Frigidaire.prototype.getCoolingState = function (callback) {
 
     debug("getting cooling state for " + this.applianceId);
     this.getValue(this.COOLINGSTATE, function (err, result) {
         if (err) {
             return callback(err);
         }
         return callback(null, result);
     });
 };
 
 Frigidaire.prototype.mode = function (mode, callback) {
 
     debug("changing mode to " + mode);
     this.sendAction(this.MODE, mode, callback);
 };
 
 Frigidaire.prototype.getUnit = function (callback) {
 
     debug("getting units for " + this.applianceId);
     this.getValue(this.UNIT, function (err, result) {
         if (err) {
             return callback(err);
         }
         return callback(null, result);
     });
 };
 
 Frigidaire.prototype.changeUnits = function (unit, callback) {
 
     debug("changing units for " + this.applianceId + " to " + unit);
     this.sendAction(this.UNIT, unit, callback);
 };
 
 Frigidaire.prototype.getCleanAir = function (callback) {
 
     debug("getting clean air status for " + this.applianceId);
     this.getValue(this.CLEANAIR, function (err, result) {
         if (err) {
             return callback(err);
         }
         return callback(null, result);
     });
 };
 
 Frigidaire.prototype.cleanAir = function (mode, callback) {
 
     debug("changing clean air for " + this.applianceId + " to " + mode);
     this.sendAction(this.CLEANAIR, mode, callback);
 };
 
 Frigidaire.prototype.fanMode = function (mode, callback) {
 
     if (typeof mode == 'function') {
         callback = mode;
         mode = applianceId;
         applianceId = this.applianceId;
     }
 
     debug("changing fan speed for " + applianceId + " to " + mode);
     this.sendAction(this.FANMODE, mode, callback);
 };
 
 Frigidaire.prototype.getFanMode = function (callback) {
 
     if (typeof applianceId == 'function') {
         callback = applianceId;
         applianceId = this.applianceId;
     }
 
     debug("getting fan mode for " + this.applianceId);
     this.getValue(this.FANMODE, function (err, result) {
         if (err) {
             return callback(err);
         }
         return callback(null, result);
     });
 };
 
 Frigidaire.prototype.setTemp = function (temp, callback) {
 
     if (typeof temp == 'function') {
         callback = temp;
         temp = applianceId;
         applianceId = this.applianceId;
     }
 
     debug("changing temp for " + this.applianceId + " to " + temp);
     this.sendAction(this.SETPOINT, Math.round(temp), callback);
 };
 
 Frigidaire.prototype.getTemp = function (callback) {
 
     if (typeof applianceId == 'function') {
         callback = applianceId;
         applianceId = this.applianceId;
     }
 
     debug("getting temp for " + this.applianceId);
     this.getValue(this.SETPOINT, function (err, result) {
         if (err) {
             return callback(err);
         }
         return callback(null, result);
     });
 };
 
 Frigidaire.prototype.getRoomTemp = function (callback) {
 
     if (typeof applianceId == 'function') {
         callback = applianceId;
         applianceId = this.applianceId;
     }
 
     if (this.disableTemp)
         return callback(null, undefined);
 
     debug("getting room temp for " + this.applianceId);
     this.getValue(this.TEMP, function (err, result) {
         if (err) {
             return callback(err);
         }
         return callback(null, result);
     });
 };
 
 module.exports = Frigidaire;
 

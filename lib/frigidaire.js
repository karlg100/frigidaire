/**
 * Frigidaire Appliance Node.js Module
 *
 * Author Karl Grindley <@karlg100>
 *
 * Todo ?
 *
 */

'use strict';

var debug   = require('debug')('frigidaire');
var extend  = require('xtend');
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
  apiUrl: 'https://prod2.connappl.com/ELXBasic'
};

function Frigidaire(options) {
  if (!(this instanceof Frigidaire)) {
    return new Frigidaire(options);
  }

  opts = extend(defaults, options);

  this.loginData = null;
  this.appVersion = opts.appVersion || "4.0.1";
  this.clientId = opts.clientId || "2c14c6f157ad3993f376755dc9dbab557ecc3909";
  this.userAgent = opts.userAgent || 'ELXSmart/4.0.1 (iPad; iOS 11.4; Scale/2.00),ELXSmart/4.0.1 (iPad; iOS 11.4; Scale/2.00),Mozilla/5.0 (iPad; CPU OS 11_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15F79/Worklight/7.1.0.0 (4311995584)';
  this.instanceId = opts.instanceId || null;
  this.sessionId = opts.sessionId || null;
  this.deviceToken = opts.deviceToken || null;
  this.applianceId = opts.applianceId || null;
  this.pollingInterval = opts.pollingInterval || 10000; // default to 10 seconds, so we don't hammer their servers
  this.attempts = 0;
  this.deviceList = null;
  this.telem = null;
  this.lastUpdate = null;
  this.updateTimer = [];
  this.deviceIndex = opts.deviceIndex || 0;
  this.stage = false;
  this.getBusy = false; // global lock for get requests.  Slow them down as simultanious requests are tripping over

  // attributes
  this.SETPOINT=7003;
  this.TEMP=7004;
  this.UNIT=7005;
  this.FANMODE=7006;
  // 7024 - unknown
  // 7025 - unknown
  // 7026 - unknown
  this.FLITER=7000;
  // 7027 - unknown
  // 7001 - sleep mode
  this.CLEANAIR=7028;
  this.MODE=7002;
  // 7020 - unknown
  // 7049 - unknown on/off what? off
  // 7048 - unknown 
  // 7047 - unknown 
  // 7046 - unknown 
  // 7038 - unknown
  // 7013 - unknown
  // 7036 - schedule on/off
  // 7010 - NIU Version
  // 7011 - unknown on/off what? on off?  power?
  // 7030 - unknown
  // 7031 - unknown
  // 7051 - unknown "Image OK" Firmware checksum?
  // 7029 - unknown
  // 7009 - Serial Number
  // 7008 - Model
  // 7007 - unknown  stop? med? fan info or something?
  
  // mode values
  this.FANMODE_AUTO=7;
  this.FANMODE_HIGH=4;
  this.FANMODE_MED=2;
  this.FANMODE_LOW=1;
  
  this.CLEANAIR_ON=1;
  this.CLEANAIR_OFF=0;
  
  this.FILTER_GOOD=0;
  this.FILTER_CHANGE=2;
  
  this.MODE_OFF=0;
  this.MODE_ECON=4;
  this.MODE_FAN=3;
  this.MODE_COOL=1;
  
  this.FAHRENHEIT=1;
  this.CELSIUS=0;
}

Frigidaire.prototype.set = function(name, value) {
  opts[name] = value;
};

// generates random string in format ........-....-....-....-............ using upercase hex
Frigidaire.prototype.generateId = function() {
  return randomstring.generate({length: 8, charset: 'hex'}).toUpperCase()+'-'+
	randomstring.generate({length: 4, charset: 'hex'}).toUpperCase()+'-'+
	randomstring.generate({length: 4, charset: 'hex'}).toUpperCase()+'-'+
	randomstring.generate({length: 4, charset: 'hex'}).toUpperCase()+'-'+
	randomstring.generate({length: 12, charset: 'hex'}).toUpperCase();
}

Frigidaire.prototype.stripJSON = function(dirtyString) {
  var trimmed=dirtyString.replace(/\/\*\-secure\-\n/,'').replace(/\*\/$/,'');
  try {
    var parsed = JSON.parse(trimmed);
    //debug(parsed);
    return parsed;
  } catch(e) {
    // we failed to parse the JSON, try again?
    console.error("failed to parse json: '"+body+"'");
    debug('trimmed body: '+trimmedBody);
  }
}

/**
 * New implementations (port of Colt JS)
 */
//Frigidaire.prototype.get = function(endpoint, args, callback, retry = true, dataType, timeout) {
Frigidaire.prototype.get = function(endpoint, args, callback, retry = true, dataType = 'json', timeout = DEFAULT_TIMEOUT) {

  debug('');
  debug('');
  debug('get()');
  debug('');
  //debug(this);
  //debug('');

  var self = this;

  if (self.getBusy) {
    if (retry != true) {
      debug("get is already running, and told not to retry, exiting...");
      return callback(new Error('get is already running, and told not to retry, exiting...'));
    }
    var sleepTime = Math.floor(Math.random() * Math.floor(500));
    //var sleepTime = 1000;
    debug("get already running, sleeping for "+sleepTime);
    return setTimeout(function() { self.get(endpoint, args, callback, retry, dataType, timeout) }, sleepTime);
  } else
    self.getBusy = true;

  //dataType = dataType || 'json';
  //timeout  = timeout || DEFAULT_TIMEOUT;

  if (!self.sessionId) {
    debug('no sessionId, starting auth sequence');
    self.getBusy = false;
    return self.authStage1({
      username: opts.username,
      password: opts.password
    }, function(err, InstanceId) {
      if (err) {
        return callback(err);
      }

      return self.get(endpoint, args, callback, retry, dataType, timeout);
    });
  }


  var form = {};

  for (var key in args) {
    if (typeof args[key] == 'string') {
      args[key] = args[key].replace(/[\\\']/g, '');
    }

    //form[key] = encodeURIComponent(args[key]);
    form[key] = args[key];
  }

  form['isAjaxRequest'] = 'true';
  form['x'] = 0.2348377558393847;

  var url = opts.apiUrl + endpoint + args.join('/');
  var headers = {
        'x-wl-app-version': this.appVersion,
        'X-WL-Session': this.sessionId,
        'X-WL-ClientId': this.clientId,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': this.userAgent,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-WL-ClientId': this.clientId
	}

  if (this.instanceId)
          headers['WL-Instance-Id'] = this.instanceId;
  if (this.stage == 2 && this.deviceToken)
	  headers['Authorization'] = '{"wl_deviceNoProvisioningRealm":{"ID":{"token":"'+this.deviceToken+'","app":{"id":"ELXSmart","version":"4.0.1"},"device":{"id":"","os":"11.4","model":"iPad4,2","environment":"iphone"},"custom":{}}}}';

  //debug('url: %s', url);
  //debug('headers: %s', headers);
  //debug('form: %s', form);
  debug('attempts: %s', self.attempts);

  if ('undefined' === typeof SEND_REQUEST || SEND_REQUEST) {
    request.post({url: url, headers: headers, form: form, jar: true, json: 'json' == dataType}, function(err, response, body) {

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
        debug("Error "+response.statusCode+" : "+response.statusMessage);
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

Frigidaire.prototype.resetAll = function() {
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

Frigidaire.prototype.scheduleUpdates = function(applianceId, callback) {
  var self = this;
  if (!applianceId)
    return callback(new Error('Missing parameter \'applianceId\''));


  debug("scheduling callbacks....");

  var sleepTime = self.pollingInterval+Math.floor(Math.random() * Math.floor(500)); // we need some randomness, otherwise one will always fail to run
  //var timer = setInterval(function(){ self.getTelemUpdate(applianceId, callback); }, sleepTime);
  var timer = setInterval(function(){ self.getTelem(callback); }, sleepTime);
  self.updateTimer.push(timer);
}

Frigidaire.prototype.callbackHandler = function(err, data) {
  if (err) {
    debug('callbackHandler : error - '+err);
    return null;
  }
  debug('callbackHandler : success');
  return null;
}

Frigidaire.prototype.authStage1 = function(credentials, callback) {
  var self = this;
  debug("authStage1()");
  self.stage = 1;

  if (!credentials.username) {
    return callback(new Error('Missing parameter \'username\''));
  }

  if (!credentials.password) {
    return callback(new Error('Missing parameter \'password\''));
  }

  this.sessionId = this.generateId();

  this.get('/apps/services/api/ELXSmart/iphone/init', [], function(err, data) {
    if (err) {
      debug('stage1 error');
      self.resetAll();
      return callback(err);
    } 
    //debug(data);
    var json=self.stripJSON(data);
    try {
      self.instanceId = json.challenges.wl_antiXSRFRealm['WL-Instance-Id'];
      self.deviceToken = json.challenges.wl_deviceNoProvisioningRealm.token;
    } catch(e) {
      // we failed to parse the JSON, try again?
     	console.error("failed to parse json: '"+data+"'");
    }

    return self.authStage2(credentials, callback);
  });
}

Frigidaire.prototype.authStage2 = function(credentials, callback) {
  var self = this;
  debug("authStage2()");

  this.stage = 2;
  this.get('/apps/services/api/ELXSmart/iphone/init', [], function(err, data) {
    if (err) {
      debug('stage 2 error');
      self.resetAll();
      return callback(err);
    } else {
      //debug(data);
      return self.authStage3(credentials, callback);
    }
  });

}

Frigidaire.prototype.authStage3 = function(credentials, callback) {
  var self = this;
  debug("authStage3()");
  self.stage = 3;

  var form=new Array();
  form['realm'] = 'SingleStepAuthRealm';
  this.get('/apps/services/api/ELXSmart/iphone/login', form, function(err, data) {
    if (err) {
      debug('login error');
      self.resetAll();
      return callback(err);
    } else {
      //debug(data);
      return self.authStage4(credentials, callback);
    }
  });
}

Frigidaire.prototype.authStage4 = function(credentials, callback) {
  var self = this;
  debug("authStage4()");
  self.stage = 4;

  var creds=new Array();
  creds['adapter'] = 'SingleStepAuthAdapter';
  creds['procedure'] = 'submitAuthentication';
  creds['parameters'] = '["'+credentials.username.toString()+'","'+credentials.password.toString()+'","en-US"]';
  this.get('/invoke', creds, function(err, data) {
    if (err) {
      debug('stage4 error');
      self.resetAll();
      return callback(err);
    } else {
      //debug('stage4 complete');
      //debug(data);
      return self.getInfo(callback);
    }
  });
}

Frigidaire.prototype.getInfo = function(callback) {
  var self = this;
  debug('getInfo()');
  //console.trace("callback : "+callback);
  var form=new Array();
  form['realm'] = 'SingleStepAuthRealm';

  self.get('/apps/services/api/ELXSmart/iphone/login', form, function(err, data) {
    if (err) {
      return callback(err);
    }

    self.loginData = self.stripJSON(data);
    self.deviceList = self.loginData.SingleStepAuthRealm.attributes.APPLIANCES;

    return callback(null, data);
  });
};

Frigidaire.prototype.getTelem = function(callback) {
  var self = this;
  debug('getTelem()');
  var form=new Array();
  form['realm'] = 'SingleStepAuthRealm';
  form['adapter'] = 'EluxDatabaseAdapter';
  form['procedure'] = 'getAllApplianceSnapshotData';
  form['parameters'] = '[]';

  var callTime = new Date;

  self.get('/apps/services/api/ELXSmart/iphone/query', form, function(err, data) {
    if (err) {
      return callback(err);
    }

    //debug(self.stripJSON(data).resultSet);
    //self.loginData = self.stripJSON(data);
    self.telem = self.stripJSON(data).resultSet;
    self.lastUpdate = callTime;

    return callback(null, data);
  });
};

Frigidaire.prototype.getTelemUpdate = function(applianceId, callback) {
  var self = this;

  var callTime = new Date;
  var form = new Array();
  var deviceIndex = self.getIndexByApplianceId(applianceId);
  console.log(self.lastUpdate.toISOString());
  console.log(self.lastUpdate.toISOString().replace('T','-').replace(':','.').replace('Z','000'));
  var lastConnect = self.lastUpdate.toISOString().replace('T','-').replace(':','.').replace('Z','000');
  //lastConnect = '2017-05-18-20.12.19.198211';  // test ability to get telem updates
  form['adapter']    = 'EluxDatabaseAdapter';
  form['procedure']  = 'getApplianceSnapshotDataWithApplianceIdAfterTimestamp';
  form['parameters'] = '['+applianceId+',"'+lastConnect+'"]';

  self.get('/apps/services/api/ELXSmart/iphone/query', form, function(err, data) {
    if (err) {
      return callback(err);
    }

    self.lastUpdate = callTime;
    //debug(self.stripJSON(data).resultSet);
    data = self.stripJSON(data).resultSet;
    debug(data);

    self.telem[self.deviceIndex].CONNECTION_TS = data.CONNECTION_TS;
    self.telem[self.deviceIndex].IS_CONNECTED = data.IS_CONNECTED;

    for (var key in data.SNAPSHOT) {
      self.telem[self.deviceIndex].SNAPSHOT[key] = data.SNAPSHOT[key];
    }
debug(self.telem[self.deviceIndex]);
    return callback(null, data);
  }, false);
};

Frigidaire.prototype.getDevices = function(callback) {
  var self = this;
  
  debug("getting device list, but getting telem first");
  this.getTelem(function(err, result) {
    if (err) {
      debug("unable to get device list!");
      return callback(err);
    }
    //debug(self.deviceList);
    return callback(null, self.deviceList);
  });
}

Frigidaire.prototype.getIndexByApplianceId = function(applianceId) {
  for (var i = 0, len = this.telem.length; i < len; i++) {
    if (this.telem[i]['APPLIANCE_ID'] == applianceId)
      return i;
  }
  debug('getIndexByApplianceid() : we just searched the avaliable telemetry, and could not find '+applianceId);
  return 0;
}

Frigidaire.prototype.getValue = function(applianceId, attribute, callback, skipUpdate = false) {
  var self = this;

  debug('getValue()');

  if (typeof attribute == 'function') {
    callback = attribute;
    attribute = applianceId;
    applianceId = this.applianceId;
  }

  //console.log(self);

  if (!self.telem) {
    err = new Error('Telementry not defined');
    return callback(err, null);
  }

  try {
    var value = self.telem[self.getIndexByApplianceId(applianceId)].SNAPSHOT[attribute].VALUE_INT;
    //var value = self.telem[self.deviceIndex].SNAPSHOT[attribute].VALUE_INT;
    debug('applianceId '+applianceId+' attribute '+attribute+' has the value '+value);
    return callback(null, value);
  } catch(e) {
    err = new Error('Attribute '+attribute+' for applianceId '+applianceId+' not defined');
    return callback(err, null);
  }
}

// send commands/actions
Frigidaire.prototype.sendAction = function(applianceId, attribute, value, callback) {
  var self = this;

  if (typeof value == 'function') {
    callback = value;
    value    = null;
  }

  var form = Array();
  form['adapter'] = 'EluxBrokerAdapter';
  form['procedure'] = 'executeApplianceCommand';
  form['parameters'] = '['+applianceId+','+attribute+','+value+']';

  return this.get('/apps/services/api/ELXSmart/iphone/query', form, callback);
};

Frigidaire.getAssetDetail = function(assetId, f, c, g, b) {
  get('device/GetAssetDetail/', [assetId, f, c], g, b, 'json', THREE_MIN_TIMEOUT)
}

/**
 * Implemented actions
 **/

Frigidaire.prototype.getMode = function(applianceId, callback) {

  if (typeof applianceId == 'function') {
    callback = applianceId;
    applianceId = this.applianceId;
  }

  debug("getting mode for "+applianceId);
  this.getValue(applianceId, this.MODE, function(err, result) {
    if (err) {
      return callback(err);
    }
    return callback(null, result);
  });
};

Frigidaire.prototype.mode = function(applianceId, mode, callback) {

  if (typeof mode == 'function') {
    callback = mode;
    mode = applianceId;
    applianceId = this.applianceId;
  }

  debug("changing mode for "+applianceId+" to "+mode);
  this.sendAction(applianceId, this.MODE, mode, callback);
};

Frigidaire.prototype.getUnit = function(applianceId, callback) {

  if (typeof applianceId == 'function') {
    callback = applianceId;
    applianceId = this.applianceId;
  }

  debug("getting units for "+applianceId);
  this.getValue(applianceId, this.UNIT, function(err, result) {
    if (err) {
      return callback(err);
    }
    return callback(null, result);
  });
};

Frigidaire.prototype.changeUnits = function(applianceId, unit, callback) {

  if (typeof unit == 'function') {
    callback = unit;
    unit = applianceId;
    applianceId = this.applianceId;
  }

  debug("changing units for "+applianceId+" to "+unit);
  this.sendAction(applianceId, this.UNIT, unit, callback);
};

Frigidaire.prototype.getCleanAir = function(applianceId, callback) {

  if (typeof applianceId == 'function') {
    callback = applianceId;
    applianceId = this.applianceId;
  }

  debug("getting clean air status for "+applianceId);
  this.getValue(applianceId, this.CLEANAIR, function(err, result) {
    if (err) {
      return callback(err);
    }
    return callback(null, result);
  });
};

Frigidaire.prototype.cleanAir = function(applianceId, mode, callback) {

  if (typeof mode == 'function') {
    callback = mode;
    mode = applianceId;
    applianceId = this.applianceId;
  }

  debug("changing clean air for "+applianceId+" to "+mode);
  this.sendAction(applianceId, this.CLEANAIR, mode, callback);
};

Frigidaire.prototype.fanMode = function(applianceId, mode, callback) {

  if (typeof mode == 'function') {
    callback = mode;
    mode = applianceId;
    applianceId = this.applianceId;
  }

  debug("changing fan speed for "+applianceId+" to "+mode);
  this.sendAction(applianceId, this.FANMODE, mode, callback);
};

Frigidaire.prototype.getFanMode = function(applianceId, callback) {

  if (typeof applianceId == 'function') {
    callback = applianceId;
    applianceId = this.applianceId;
  }

  debug("getting fan mode for "+applianceId);
  this.getValue(applianceId, this.FANMODE, function(err, result) {
    if (err) {
      return callback(err);
    }
    return callback(null, result);
  });
};

Frigidaire.prototype.setTemp = function(applianceId, temp, callback) {

  if (typeof temp == 'function') {
    callback = temp;
    temp = applianceId;
    applianceId = this.applianceId;
  }

  debug("changing temp for "+applianceId+" to "+temp);
  this.sendAction(applianceId, this.SETPOINT, Math.round(temp)*10, callback);
};

Frigidaire.prototype.getTemp = function(applianceId, callback) {

  if (typeof applianceId == 'function') {
    callback = applianceId;
    applianceId = this.applianceId;
  }

  debug("getting temp for "+applianceId);
  this.getValue(applianceId, this.SETPOINT, function(err, result) {
    if (err) {
      return callback(err);
    }
    return callback(null, result/10);
  });
};

Frigidaire.prototype.getRoomTemp = function(applianceId, callback) {

  if (typeof applianceId == 'function') {
    callback = applianceId;
    applianceId = this.applianceId;
  }

  debug("getting room temp for "+applianceId);
  this.getValue(applianceId, this.TEMP, function(err, result) {
    if (err) {
      return callback(err);
    }
    return callback(null, result/10);
  });
};





module.exports = Frigidaire;

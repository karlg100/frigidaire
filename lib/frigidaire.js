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
  this.attempts = 0;
  this.deviceList = null;
  this.telem = null;
  this.deviceIndex = opts.deviceIndex || 0;
  this.challenge = false;

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
  this.CELCIUS=0;
  
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
Frigidaire.prototype.get = function(endpoint, args, callback, dataType, timeout) {

  debug('');
  debug('');
  debug('get()');
  debug('');
  debug(this);
  debug('');

  var self = this;

  dataType = dataType || 'json';
  timeout  = timeout || DEFAULT_TIMEOUT;

  if (!self.sessionId) {
    return self.authStage1({
      username: opts.username,
      password: opts.password
    }, function(err, InstanceId) {
      if (err) {
        return callback(err);
      }

      return self.get(endpoint, args, callback, dataType, timeout);
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
  if (this.challenge && this.deviceToken)
	  headers['Authorization'] = '{"wl_deviceNoProvisioningRealm":{"ID":{"token":"'+this.deviceToken+'","app":{"id":"ELXSmart","version":"4.0.1"},"device":{"id":"","os":"11.4","model":"iPad4,2","environment":"iphone"},"custom":{}}}}';

  debug('url: %s', url);
  debug('headers: %s', headers);
  debug('form: %s', form);

  if ('undefined' === typeof SEND_REQUEST || SEND_REQUEST) {
    request.post({url: url, headers: headers, form: form, jar: true, json: 'json' == dataType}, function(err, response, body) {

      if (!response) {
        err = new Error('no response!');
        return callback(err);
      }

      ++self.attempts;
      if (response.statusCode == 401 && !this.deviceToken && !this.instanceId && self.attempts < 3) {
        return callback(null, body);
      } /* else if (response.statusCode == 400 && self.attempts < 3) {
        self.sessionId = null;

        return self.get(endpoint, args, callback, dataType, timeout);
      } */

      self.attempts = 0;

      if (!err && response.statusCode != 200) {
        err = new Error(response.statusCode + ' ' + response.statusMessage);
      }

      if (err) {
        return callback(err);
      }

      return callback(null, body);
    });
  }
}

Frigidaire.prototype.resetAll = function() {
  this.loginData = null;
  this.deviceList = null;
  this.instanceId = null;
  this.deviceToken = null;
  this.sessionId = null;
  this.telem = null;
  this.sessionPending = false;
  //this.deviceList = null;
  //this.deviceList = null;
  this.challenge = false;
}

Frigidaire.prototype.authStage1 = function(credentials, callback) {
  var self = this;
  debug("authStage1()");

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
    } else {
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
    }
  });
}

Frigidaire.prototype.authStage2 = function(credentials, callback) {
  var self = this;
  debug("authStage2()");

  this.challenge = true;
  this.get('/apps/services/api/ELXSmart/iphone/init', [], function(err, data) {
    if (err) {
      debug('stage 2 error');
      self.resetAll();
      return callback(err);
    } else {
      self.challenge = false;
      //debug(data);
      return self.authStage3(credentials, callback);
    }
  });

}

Frigidaire.prototype.authStage3 = function(credentials, callback) {
  var self = this;
  debug("authStage3()");

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
      return self.getInfo(credentials, callback);
    }
  });
}

Frigidaire.prototype.getInfo = function(credentials, callback) {
  var self = this;

  var form=new Array();
  form['realm'] = 'SingleStepAuthRealm';

  self.get('/apps/services/api/ELXSmart/iphone/login', form, function(err, data) {
    if (err) {
      return callback(err);
    }

    self.loginData = self.stripJSON(data);
    self.deviceList = self.loginData.SingleStepAuthRealm.attributes.APPLIANCES;

    return callback(null, self.loginData);
  });
};

Frigidaire.prototype.getTelem = function(callback) {
  var self = this;

  var form=new Array();
  form['realm'] = 'SingleStepAuthRealm';
  form['adapter'] = 'EluxDatabaseAdapter';
  form['procedure'] = 'getAllApplianceSnapshotData';
  form['parameters'] = '[]';

  self.get('/apps/services/api/ELXSmart/iphone/query', form, function(err, data) {
    if (err) {
      return callback(err);
    }

    //debug(self.stripJSON(data).resultSet);
    //self.loginData = self.stripJSON(data);
    self.telem = self.stripJSON(data).resultSet;

    return callback(null, data);
  });
};

Frigidaire.prototype.getValue = function(applianceId, attribute, callback) {
  var self = this;

  debug('getValue()');

  if (typeof attribute == 'function') {
    callback = attribute;
    attribute = applianceId;
    applianceId = this.applianceId;
  }

console.log(self);

  if (!self.telem) 
    self.resetAll();

  if (!self.instanceId) {
    debug('gettingTelem()');
    return self.getTelem(function(err, data) {
      if (err) {
        return callback(err);
      }
      return self.getValue(applianceId, attribute, callback);
    });
  }

  var value = self.telem[self.deviceIndex].SNAPSHOT[attribute].VALUE_INT;
  debug('applianceId '+self.applianceId+' attribute '+attribute+' has the value '+value);
  return callback(null, value);
}

/*

Frigidaire.prototype.getDeviceId = function(deviceIndex, callback) {
  var self = this;

  if (typeof deviceIndex == 'function') {
    callback = deviceIndex;
    deviceIndex = 0;
  }

  if (this.deviceId) {
    return callback(null, this.deviceId);
  }

  if (this.deviceIndex) {
    deviceIndex = self.deviceIndex;
  }

  if (deviceIndex === undefined) {
    deviceIndex = 0;
  }

  this.getAssets(function(err, assets) {
    if (err) {
      return callback(err);
    }

    self.deviceId = assets[deviceIndex].DeviceId;

    return callback(null, self.deviceId);
  });
};

Frigidaire.prototype.getDeviceIdByName = function(deviceName, callback) {
  var self = this;

  if (typeof deviceName == 'function') {
    callback = deviceName;
    deviceName = 0;
  }

  if (this.deviceId) {
    return callback(null, this.deviceId);
  }

  if (deviceName === undefined) {
    deviceName = 0;
  }

  this.getAssets(function(err, assets) {
    if (err) {
      return callback(err);
    }

    debug(assets);

    var deviceId = null;

    for (var i = 0; i < assets.length; i++) {
      var asset = assets[i];

      debug('deviceName = "%s"', deviceName.toLowerCase());

      // Direct identical comparison (lowercase)
      if (asset.Name.toLowerCase().localeCompare(deviceName.toLowerCase()) === 0) {
        debug('deviceId found with localeCompare');
        deviceId = asset.DeviceId;
        break;
      }

      // Contains comparison (lowercase)
      if (asset.Name.toLowerCase().indexOf(deviceName.toLowerCase()) !== -1) {
        debug('deviceId found with indexOf');
        deviceId = asset.DeviceId;
        break;
      }
    }

    debug('deviceId: %d', deviceId);

    self.deviceId = deviceId;

    return callback(null, self.deviceId);
  });
};

Frigidaire.prototype.getDevice = function(deviceIndex, callback) {
  var self = this;

  if (typeof deviceIndex == 'function') {
    callback = deviceIndex;
    deviceIndex = 0;
  }

  if (this.assets && this.assets[deviceIndex]) {
    return callback(null, this.assets[deviceIndex]);
  }

  if (deviceIndex === undefined) {
    deviceIndex = 0;
  }

  this.getAssets(function(err, assets) {
    if (!err && !assets[deviceIndex]) {
      err = new Error('Invalid device index "' + deviceIndex + '"');
    }

    if (err) {
      return callback(err);
    }

    return callback(null, assets[deviceIndex]);
  });
};

Frigidaire.prototype.getActions = function(deviceIndex, callback) {
  var self = this;

  if (typeof deviceIndex == 'function') {
    callback = deviceIndex;
    deviceIndex = 0;
  }

  if (this.actions === null) {
    this.actions = {};
  }

  if (this.actions && this.actions[deviceIndex]) {
    return callback(null, this.actions[deviceIndex]);
  }

  if (deviceIndex === undefined) {
    deviceIndex = 0;
  }

  this.getDevice(deviceIndex, function(err, device) {
    var actions = [];

    for (var i = 0; i < device.AvailActions.length; i++) {
      actions.push(device.AvailActions[i].Name.toLowerCase());
    }

    self.actions[deviceIndex] = actions.filter(function(elem, pos) {
      debug('_status:', elem.indexOf('_status'));
      debug('_nostatus', elem.indexOf('_nostatus'));

      if (elem.indexOf('_status') != -1 || elem.indexOf('_nostatus') != -1) {
        return false;
      }

      return actions.indexOf(elem) == pos;
    });

    self.actions[deviceIndex].sort();

    return callback(null, self.actions[deviceIndex]);
  });
};
*/

Frigidaire.prototype.sendAction = function(applianceId, attribute, value, callback) {
  var self = this;

  if (typeof value == 'function') {
    callback = value;
    value    = null;
  }

/*
  if (!deviceId) {
    return this.getDeviceId(function(err, autoDeviceId) {
      if (err) {
        return callback(err);
      }

      return self.sendAction(autoDeviceId, command, arg1, arg2, callback);
    });
  }
*/
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
  this.sendAction(applianceId, this.SETPOINT, temp*10, callback);
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

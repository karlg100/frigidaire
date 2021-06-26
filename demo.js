var Frigidaire = require('./lib/frigidaire.js')
var util = require('util');

console.log('starting up');

var ac = new Frigidaire({
  username: 'john@example.com',
  password: 'frigidaire1492915@!',
  //applianceSerial: '12345678',
  //deviceId: 'O2-w8yjkjotjQj9J_AolEaeSZZlmTQ501ahP'
});

// time to wait for module init to complete
var callbackTime = 4000;

var applainceSerial = null;
var an = 2;
if (process.argv[2] != 'setTemp' && process.argv.length > 3) {
  var applianceSerial = process.argv[an];
  ++an;
}
var command = process.argv[an]; ++an;
var arg = process.argv[an];

// define what to do for each command
var cmdMap = {};
cmdMap["getTelem"] = 'getTelem';
cmdMap["getMode"] = 'getMode';
cmdMap["getCoolingState"] = 'getCoolingState';
cmdMap["getUnit"] = 'getUnit';
cmdMap["getCleanAir"] = 'getCleanAir';
cmdMap["getFanMode"] = 'getFanMode';
cmdMap["getTemp"] = 'getTemp';
cmdMap["getRoomTemp"] = 'getRoomTemp';

cmdMap["off"] = 'mode';
cmdMap["cool"] = 'mode';
cmdMap["econ"] = 'mode';
cmdMap["fan"] = 'mode';
cmdMap["f"] = 'changeUnits';
cmdMap["fahrenheit"] = 'changeUnits';
cmdMap["c"] = 'changeUnits';
cmdMap["celsius"] = 'changeUnits';
cmdMap["cleanAirOn"] = 'cleanAir';
cmdMap["cleanAirOff"] = 'cleanAir';
cmdMap["fanAuto"] = 'fanMode';
cmdMap["fanHigh"] = 'fanMode';
cmdMap["fanMed"] = 'fanMode';
cmdMap["fanLow"] = 'fanMode';
cmdMap["setTemp"] = 'setTemp';

var cmdArg = {};
cmdArg["off"] = ac.MODE_OFF;
cmdArg["cool"] = ac.MODE_COOL;
cmdArg["econ"] = ac.MODE_ECON;
cmdArg["fan"] = ac.MODE_FAN;
cmdArg["f"] = ac.FAHRENHEIT
cmdArg["fahrenheit"] = ac.FAHRENHEIT;
cmdArg["c"] = ac.CELSIUS;
cmdArg["celsius"] = ac.CELSIUS;
cmdArg["cleanAirOn"] = ac.CLEANAIR_ON;
cmdArg["cleanAirOff"] = ac.CLEANAIR_OFF;
cmdArg["fanAuto"] = ac.FANMODE_AUTO;
cmdArg["fanHigh"] = ac.FANMODE_HIGH;
cmdArg["fanMed"] = ac.FANMODE_MED;
cmdArg["fanLow"] = ac.FANMODE_LOW;
cmdArg["setTemp"] = arg;

function schCall(ac, func, applianceSerial, arg = null) {
    if (arg !== null) {
      console.log("Running " + func + " with arg " + arg);
      ac[func](applianceSerial, arg, function(err, result) {
        if (err) return console.error(err);
        console.log('Changed ' + func + " to " + arg + " : " + util.inspect(result,false,null));
        //console.log(util.inspect(result,false,null));
        //console.log(util.inspect(ac, false, null));
      });
    } else {
      console.log("Getting " + func);
      ac[func](applianceSerial, function(err, result) {
        if (err) return console.error(err);
        console.log('Result ' + func + " : " + util.inspect(result,false,null));
        //console.log(util.inspect(result,false,null));
        //console.log(util.inspect(ac, false, null));
      });
    }
}

switch (command) {

  // login, get devices and current telementry
  case 'devices':
    console.log("Getting Devices");
    ac.getDevices(function(err, result) {
        if (err) return console.error(err);
        console.log('Got Devices');
        console.log(util.inspect(ac.deviceList, false, null));
    });
    break;

  // get telem / attributes
  case 'getTelem':
  case 'getMode':
  case 'getCoolingState':
  case 'getUnit':
  case 'getCleanAir':
  case 'getFanMode':
  case 'getTemp':
  case 'getRoomTemp':
    console.log("Scheduling " + command + " in " + callbackTime + "ms");
    setTimeout(schCall, callbackTime, ac, command, applianceSerial);
    break;

  // set attributes
  case 'off':
  case 'cool':
  case 'econ':
  case 'fan':
  case 'f':
  case 'fahrenheit':
  case 'c':
  case 'celsius':
  case 'cleanAirOn':
  case 'cleanAirOoff':
  case 'fanAuto':
  case 'fanHigh':
  case 'fanMed':
  case 'fanLow':
  case 'setTemp':
    console.log("Scheduling " + command + " with " + cmdMap[command] + " with arg " + cmdArg[command] +" in " + callbackTime + "ms");
    setTimeout(schCall, callbackTime, ac, cmdMap[command], applianceSerial, cmdArg[command]);
    break;

/*
  // these are broken for now
  case 'telemUpdate':
    console.log("Getting telem update");
    ac.getTelem(applianceSerial, function(err, result) {
        if (err) return console.error(err);
        console.log('Got Telem');
        ac.getTelemUpdate(applianceSerial, ac.applianceId, function(err, update) {
            console.log(update);
            console.log(util.inspect(ac, false, null));
        });
    });
    break;

  case 'testReauth':
    console.log("Testing telem reauth");
    ac.getTelem(applianceSerial, function(err, result) {
        if (err) return console.error(err);
        console.log('Got Telem, resetting session');
        ac.init();
        ac.getTelem(applianceSerial, function(err, update) {
            if (err) return console.error(err);
            console.log(update);
            console.log(util.inspect(ac, false, null));
        });
    });
    break;
*/

  default:
    console.error('Unknown command:', command);
    console.error('Available commands are: [serialNumber] ' + Object.keys(cmdMap));
    break;
}

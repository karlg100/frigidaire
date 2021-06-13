var Frigidaire = require('./lib/frigidaire.js')
var util = require('util');

console.log('starting up');

var ac = new Frigidaire({
  username: 'john@example.com',
  password: 'frigidaire1492915@!',
  //applianceSerial: '12345678',
  //deviceId: 'O2-w8yjkjotjQj9J_AolEaeSZZlmTQ501ahP'
});

var applainceSerial = null;
var an = 2;
if (process.argv.length > 3) {
  var applianceSerial = process.argv[an];
  ++an;
}
var command = process.argv[an]; ++an;
var arg = process.argv[an];

//console.log(ac);

switch (command) {

  // login, get devices and current telementry
  case 'devices':
    ac.getDevices(function(err, result) {
        if (err) return console.error(err);
        console.log('Got Devices');
        console.log(util.inspect(ac.deviceList, false, null));
    });
    break;

  case 'telem':
  case 'get':
    ac.getTelem(applianceSerial, function(err, result) {
        if (err) return console.error(err);
        console.log('Got Telem');
        console.log(util.inspect(result,false,null));
        //console.log(util.inspect(ac, false, null));
    });
    break;

  case 'telemUpdate':
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


  // Mode
   case 'getMode':
     ac.getMode(applianceSerial, function(err, result) {
        if (err) return console.error(err);
        console.log('Mode is '+result);
     });
     break;

   case 'getCoolingState':
    ac.getCoolingState(applianceSerial, function(err, result) {
        if (err) return console.error(err);
        console.log('Mode is '+result);
    });
    break;

  case 'off':
    ac.mode(applianceSerial, ac.MODE_OFF, function(err, result) {
        if (err) return console.error(err);
        console.log('Turned off');
    });
    break;

  case 'cool':
    ac.mode(applianceSerial, ac.MODE_COOL, function(err, result) {
        if (err) return console.error(err);
        console.log('Changed to cool mode');
    });
    break;

  case 'econ':
    ac.mode(applianceSerial, ac.MODE_ECON, function(err, result) {
        if (err) return console.error(err);
        console.log('Changed to econ mode');
    });
    break;

  case 'fan':
    ac.mode(applianceSerial, ac.MODE_FAN, function(err, result) {
        if (err) return console.error(err);
        console.log('Changed to fan only mode');
    });
    break;

  // Units
   case 'getUnit':
    ac.getUnit(applianceSerial, function(err, result) {
        if (err) return console.error(err);
        console.log('Unit is '+result);
    });
    break;

  case 'f':
  case 'fahrenheit':
    ac.changeUnits(applianceSerial, ac.FAHRENHEIT,function(err, result) {
        if (err) return console.error(err);
        console.log('Changed to fahrenheit');
    });
    break;

  case 'c':
  case 'celcius':
    ac.changeUnits(applianceSerial, ac.CELCIUS,function(err, result) {
        if (err) return console.error(err);
        console.log('Changed to celcius');
    });
    break;

  // Clean Air
   case 'getClean':
    ac.getCleanAir(applianceSerial, function(err, result) {
        if (err) return console.error(err);
        console.log('Clean air is '+result);
    });
    break;

  case 'clean':
    ac.cleanAir(applianceSerial, ac.CLEANAIR_ON, function(err, result) {
        if (err) return console.error(err);
        console.log('Turned on clean air');
    });
    break;

  case 'rec':
    ac.cleanAir(applianceSerial, ac.CLEANAIR_OFF, function(err, result) {
        if (err) return console.error(err);
        console.log('Turned off clean air');
    });
    break;

  // Fan Mode
  case 'getFan':
    ac.getFanMode(applianceSerial, function(err, result) {
        if (err) return console.error(err);
        console.log('current fan mode is '+result);
    });
    break;

 case 'auto':
    ac.fanMode(applianceSerial, ac.FANMODE_AUTO, function(err, result) {
        if (err) return console.error(err);
        console.log('Turned fan to auto');
    });
    break;

  case 'high':
    ac.fanMode(applianceSerial, ac.FANMODE_HIGH, function(err, result) {
        if (err) return console.error(err);
        console.log('Turned fan to high');
    });
    break;

  case 'med':
    ac.fanMode(applianceSerial, ac.FANMODE_MED, function(err, result) {
        if (err) return console.error(err);
        console.log('Turned fan to medium');
    });
    break;

  case 'low':
    ac.fanMode(applianceSerial, ac.FANMODE_LOW, function(err, result) {
        if (err) return console.error(err);
        console.log('Turned fan to low');
    });
    break;

  case 'setTemp':
    ac.setTemp(applianceSerial, arg, function(err, result) {
        if (err) return console.error(err);
        console.log('changed temp to '+arg);
    });
    break;

  case 'getTemp':
    ac.getTemp(applianceSerial, function(err, result) {
        if (err) return console.error(err);
        console.log('current setpoint temp is '+result);
    });
    break;

  case 'getRoomTemp':
    ac.getRoomTemp(applianceSerial, function(err, result) {
        if (err) return console.error(err);
        console.log('current actual room temp is '+result);
    });
    break;

  default:
    console.error('Unknown command:', command);
    console.error('Available commands are: [serialNumber] get|telem, telemUpdate, testReauth, devices, getMode, getCoolingState, off, cool, econ, fan, getUnit, f|fahrenheit, c|celcius, getClean, clean, rec, getFan, auto, high, med, low, setTemp, getTemp, getRoomTemp');
    break;
}

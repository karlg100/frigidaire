var Frigidaire = require('frigidaire');
var util = require('util');

console.log('starting up');
var ac = new Frigidaire({
  //applianceId: 4567,  // uncomment and specify the specific ApplianceId from telem
  //deviceIndex: 0,     // uncomment to specify the device by the order it is returned (starting with 0 as the first device)
  username: 'foo@bar.net',
  password: 'foobar',
});

var command = process.argv[2];
var arg = process.argv[3];
//console.log(ac);

switch (command) {

  // login, get devices and current telementry
  case 'devices':
    ac.getDevices(function(err, result) {
      if (err) return console.error(err);
      console.log('Got Devices');
      console.log(util.inspect(result, false, null));
    });
    break;

  case 'telem':
  case 'get':
    ac.getTelem(function(err, result) {
      if (err) return console.error(err);
      console.log('Got Telem');
      console.log(result);
      console.log(util.inspect(ac, false, null));
    });
    break;

  case 'telemUpdate':
    ac.getTelem(function(err, result) {
      if (err) return console.error(err);
      console.log('Got Telem');
      ac.getTelemUpdate(ac.applianceId, function(err, update) {
        console.log(update);
        console.log(util.inspect(ac, false, null));
      });
    });
    break;


  // Mode
   case 'getMode':
    ac.getMode(function(err, result) {
      if (err) return console.error(err);
      console.log('Mode is '+result);
    });
    break;

  case 'off':
    ac.mode(ac.MODE_OFF, function(err, result) {
      if (err) return console.error(err);
      console.log('Turned off');
    });
    break;

  case 'cool':
    ac.mode(ac.MODE_COOL, function(err, result) {
      if (err) return console.error(err);
      console.log('Changed to cool mode');
    });
    break;

  case 'econ':
    ac.mode(ac.MODE_ECON, function(err, result) {
      if (err) return console.error(err);
      console.log('Changed to econ mode');
    });
    break;

  case 'fan':
    ac.mode(ac.MODE_FAN, function(err, result) {
      if (err) return console.error(err);
      console.log('Changed to fan only mode');
    });
    break;

  // Units
   case 'getUnit':
    ac.getUnit(function(err, result) {
      if (err) return console.error(err);
      console.log('Mode is '+result);
    });
    break;

  case 'f':
  case 'fahrenheit':
    ac.changeUnits(ac.FAHRENHEIT,function(err, result) {
      if (err) return console.error(err);
      console.log('Changed to fahrenheit');
    });
    break;

  case 'c':
  case 'celcius':
    ac.changeUnits(ac.CELCIUS,function(err, result) {
      if (err) return console.error(err);
      console.log('Changed to celcius');
    });
    break;

  // Clean Air
   case 'getClean':
    ac.getCleanAir(function(err, result) {
      if (err) return console.error(err);
      console.log('Clean air is '+result);
    });
    break;

  case 'clean':
    ac.cleanAir(ac.CLEANAIR_ON, function(err, result) {
      if (err) return console.error(err);
      console.log('Turned on clean air');
    });
    break;

  case 'rec':
    ac.cleanAir(ac.CLEANAIR_OFF, function(err, result) {
      if (err) return console.error(err);
      console.log('Turned off clean air');
    });
    break;

  // Fan Mode
  case 'getFan':
    ac.getFanMode(function(err, result) {
      if (err) return console.error(err);
      console.log('current fan mode is '+result);
    });
    break;

 case 'auto':
    ac.fanMode(ac.FANMODE_AUTO, function(err, result) {
      if (err) return console.error(err);
      console.log('Turned fan to auto');
    });
    break;

  case 'high':
    ac.fanMode(ac.FANMODE_HIGH, function(err, result) {
      if (err) return console.error(err);
      console.log('Turned fan to high');
    });
    break;

  case 'med':
    ac.fanMode(ac.FANMODE_MED, function(err, result) {
      if (err) return console.error(err);
      console.log('Turned fan to medium');
    });
    break;

  case 'low':
    ac.fanMode(ac.FANMODE_LOW, function(err, result) {
      if (err) return console.error(err);
      console.log('Turned fan to low');
    });
    break;

  case 'temp':
    ac.setTemp(arg, function(err, result) {
      if (err) return console.error(err);
      console.log('changed temp to '+arg);
    });
    break;

  case 'getTemp':
    ac.getTemp(function(err, result) {
      if (err) return console.error(err);
      console.log('current temp is '+result);
    });
    break;

  case 'getRoomTemp':
    ac.getRoomTemp(function(err, result) {
      if (err) return console.error(err);
      console.log('current room temp is '+result);
    });
    break;

  default:
    console.error('Unknown command:', command);
    console.error('Available commands are: get|telem, telemUpdate, devices, getMode, off, cool, econ, fan, getUnit, f|fahrenheit, c|celcius, getClean, clean, rec, getFan, auto, high, med, low, setTemp, getTemp, getRoomTemp');
    break;
}

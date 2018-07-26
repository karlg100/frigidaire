var Frigidaire = require('frigidaire');

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
  case 'telem':
  case 'get':
    ac.getTelem([], function(err, result) {
      if (err) return console.error(err);
      console.log('Got Telem');
      console.log(result);
      console.log(ac);
    });
    break;

  // mode
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

  // change units
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

  // clean air
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

  // fan mode
  case 'auto':
    ac.fanMode(ac.FANMODE_AUTO, function(err, result) {
      if (err) return console.error(err);
      console.log('Turned fan to auto');
    });

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

  case 'temp':
    ac.setTemp(arg, function(err, result) {
      if (err) return console.error(err);
      console.log('Turned fan to low');
    });

  default:
    console.error('Unknown command:', command);
    console.error('Available commands are: get|telem, off, cool, econ, fan, f|fahrenheit, c|celcius, clean, rec, auto, high, med, low');
    break;
}

# Frigidaire Cloud Node.js Module

This is a quick and dirty IBM WorkLight client to talk to the Frigidaire cloud services for C&C of Frigidiare Wifi enabled devices.  Ultimate goal is to integreate with HomeKit for Siri and better UI/UX expereince!  (the Frigidare App is terrible)

# Done
* Auth is working!
* setting attributes values works!
* getting attribute values works!
* function library complete for homebridge plugin support!

# Todo
* figure out how the X-WL-ClientId is generated.  it appears to be a sha1sum of something, not sure what.  
** tested with another device, it seems to definately be dependant upon the device type
** not based on iOS version
** probably some conbination of the app version and device string
** needs to match their database of expected device string, or will fail auth chain
* build out a way to receive updated telementry and cache it locally
* add a timer to recieve updated telementry (try to keep the timing to the observed behavor in the real client.  seems to be every 2-4 seconds.  however, maybe we need less if homekit is not focued?  this may be done on the homebridge plugin side)

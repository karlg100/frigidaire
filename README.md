# Frigidaire Cloud Node.js Module

# Update 5-30-2021
Frigidaire updated their app which broke the original version of this plugin. The plugin now has been updated to work with this new app from Frigidaire!

This is a quick and dirty IBM WorkLight client to talk to the Frigidaire cloud services for C&C of Frigidiare Wifi enabled devices.  Ultimate goal is to integreate with HomeKit for Siri and better UI/UX expereince!  (the Frigidare App is terrible)

# Done
* Auth is working!
* setting attributes values works!
* getting attribute values works!
* function library complete for homebridge plugin support!
* telemetry updates now fetched and merged into the telem data

# Todo
* figure out how the X-WL-ClientId is generated.  it appears to be a sha1sum of something, not sure what.  
  * tested with another device, it seems to definately be dependant upon the device type
  * not based on iOS version
  * probably some conbination of the app version and device string
  * needs to match their database of expected device string, or will fail auth chain
* Telementry updates
  * add a timer to recieve updated telementry (try to keep the timing to the observed behavor in the real client.  seems to be every 2-4 seconds.  however, maybe we need less if homekit is not focued?  this may be done on the homebridge plugin side)

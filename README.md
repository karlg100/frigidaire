# Frigidaire Cloud Node.js Module


This is a quick and dirty client to talk to the Frigidaire cloud services for C&C of Frigidiare Wifi enabled devices.  Ultimate goal is to integreate with HomeKit for Siri and better UI/UX expereince!  (the Frigidare App is terrible)

# Done
* Frigidaire updated their app which broke the original version of this plugin. The plugin now has been updated to work with this new app from Frigidaire!
* Auth retooled, again
* setting attributes values works!
* getting attribute values works!
* function library complete for homebridge plugin support!
* telemetry updates now fetched and merged into the telem data

# Todo
* tested with another device, it seems to definately be dependant upon the device type
* not based on iOS version
* probably some conbination of the app version and device string
* needs to match their database of expected device string, or will fail auth chain
* add a timer to recieve updated telementry (try to keep the timing to the observed behavor in the real client.  seems to be every 2-4 seconds.  however, maybe we need less if homekit is not focued?  this may be done on the homebridge plugin side)

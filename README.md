# Frigidaire Cloud Node.js Module

This is a quick and dirty IBM WorkLight client to talk to the Frigidaire cloud services for C&C of Frigidiare Wifi enabled devices.  Ultimate goal is to integreate with HomeKit for Siri and better UI/UX expereince!  (the Frigidare App is terrible)

# Done
* Auth is working!

# TODO
* figure out how the X-WL-ClientId is generated.  it appears to be a sha1sum of something, not sure what.  (is not OS version)  probably some conbination of the app version and device string
* build out a way to send commands
* build out a way to receive telementry and update it
* build out a function library to hand all the device controls for homebridge support

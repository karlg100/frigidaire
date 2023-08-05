# Frigidaire Cloud Node.js Module


This is a quick and dirty client to talk to the Frigidaire cloud services for C&C of Frigidiare Wifi enabled devices.  Ultimate goal is to integreate with HomeKit for Siri and better UI/UX expereince!  (the Frigidare App is terrible)

## Update 2023-06-26

Frigidaire once again updated their API (to V3) in June 2023, meaning the module had to be largely rewritten. The new V3 API uses a standard OAuth flow for authentication, and appears to be much simpler in architecture.

Another benefit of the V3 API is the auto-discovery process for geography. All you need is a working username/password, and it will automatically determine the correct endpoint (US/EU/LATAM/etc) to use.

While the only device I had available to test with is an AC unit, the V3 API gives me confidence that additional device types can be easily implemented.

This module has been updated so that it fully utilizes the V3 API, leaving no dependency on the old V2 API.

So as to maintain backwards compatibility, the old V2 API code has <b>not been removed</b>, and remains fully usable. To specify the use of the V2 API, when instantiating a new `Frigidaire` object, specify `false` as the second parameter, ie:
```
var ac = new Frigidaire({
  username: 'john@example.com',
  password: 'frigidaire1492915@!',
}, false);
```
That second parameter is set to default to `true` (see line 42 in `lib/frigidaire.js`), so the plugin will default to using the new V3 API. This means that any downstream modules (ie <i>homebridge-frigidaire</i>) can test against the new API with a minimum of code refactoring.

### New configuration option: refresh token caching
Because the V3 API uses standard OAuth for authentication, it uses refresh tokens as a 'shortcut' to obtain an access token. This refresh token can be cached on disk, enabling the module to start faster, as well as be a better API citizen.

To enable this functionality, provide a writable directory path with the `cacheDir` option when instantiating a Frigidaire object. The refresh token will be saved in this directory, with filename `.frigidaireRefreshToken_<applianceSN>`.

The <i>homebridge-frigidaire</i> plugin has been updated to take advantage of this new functionality; see the respective documentation for information on how to enable.
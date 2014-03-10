// nconf may not be the best thing for this, but it works for now.
// Really all that's needed is a recursive version of "extend".

var fs = require('fs'),
    path = require('path'),
    nconf = require('nconf');

nconf.file('local', {file: path.join(__dirname, 'local.json')})
    .file('defaults', {file: path.join(__dirname, 'defaults.json')});

module.exports = nconf.get(); // whole config object

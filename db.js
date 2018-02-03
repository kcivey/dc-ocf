module.exports = require('knex')({
        client: 'sqlite3',
        connection: {
            filename: __dirname + '/dc-ocf.sqlite'
        }
    });

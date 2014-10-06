var mysql = require('mysql'),
    domainModels = {};

function Api() {

    function connect(cb) {
        var connection = mysql.createConnection({
            host: '127.0.0.1',
            user: 'immodispo',
            password: 'devpassword',
            database: 'immodispo'
        });

        connection.connect();
        domainModels.region = require("./models/Region")(connection);
        domainModels.department = require("./models/Department")(connection);
        domainModels.town = require("./models/Town")(connection);

        setImmediate(function() {cb(null, domainModels);});
    }

    function models() {
        return domainModels;
    }

    return {
        connect: connect,
        models: models
    };
};

module.exports = new Api();
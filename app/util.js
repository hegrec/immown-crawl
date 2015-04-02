var env = require("./env"),
    _ = require('lodash'),
    Api = require('immodispo-api-client'),
    api = new Api(env.api.username, env.api.password);

function _guid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
}

function findTownByName(name, cb) {
    api.get(env.API_HOST + '/towns?filter=name~>' + encodeURIComponent(name), function (err, items) {
        if (err) {
            return cb(err);
        }

        if (items.body.length === 0) {
            return cb(null, null);
        }

        cb(null, items.body[0]);
    })
}



function findTownByPostcode(code, cb) {
    api.get(env.API_HOST + '/towns?sort=-population&filter=code=' + Number(code), function (err, items) {
        if (err) {
            return cb(err);
        }

        if (items.body.length === 0) {
            return cb(null, null);
        }

        cb(null, items.body[0]);
    })
}

module.exports = {
    guid:_guid,
    findTownByName: findTownByName,
    findTownByPostcode: findTownByPostcode,
    getImageExtension: function (imageURL) {
        if (imageURL.indexOf(".png") > -1) {
            return ".png";
        } else if (imageURL.indexOf(".jpg") > -1) {
            return ".jpg";
        }
        return false;
    }
};

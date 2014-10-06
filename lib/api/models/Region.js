var Base = require('./Base');

function Region(db) {
    var region = {};
    region.__proto__ = new Base(db);

    region.setTableName('Regions');
    region.setSchema({
        name: String,
        code: Number,
        capital: String,
        latitude: Number,
        longitude: Number
    });

    return region;
}

module.exports = Region;
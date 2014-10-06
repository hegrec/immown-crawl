var Base = require('./Base');

function Town(db) {
    var town = {};
    town.__proto__ = new Base(db);

    town.setTableName('Towns');
    town.setSchema({
        name: String,
        code: Number,
        kml: String,
        surface_area: Number,
        population: Number,
        latitude: Number,
        longitude: Number,
        RegionId: Number,
        DepartmentId: Number
    });

    return town;
}

module.exports = Town;
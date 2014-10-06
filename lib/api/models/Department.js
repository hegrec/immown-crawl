var Base = require('./Base');

function Department(db) {
    var department = {};
    department.__proto__ = new Base(db);

    department.setTableName('Departments');
    department.setSchema({
        name: String,
        code: Number,
        capital: String,
        kml: String,
        latitude: Number,
        longitude: Number,
        RegionId: Number
    });

    return department;
}

module.exports = Department;
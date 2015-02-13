var _ = require('lodash');

function Department(server) {
    var department = {};
    
    department.name = null;
    department.code = 0;
    department.capital = null;
    department.kml = null;
    department.latitude = 0;
    department.longitude = 0;

    return department;
}

module.exports = Department;
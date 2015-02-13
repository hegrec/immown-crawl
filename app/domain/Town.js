var _ = require('lodash');

function Town(server) {
    var town = {};

    town.name = null;
    town.code = 0;
    town.kml = null;
    town.surface_area = 0;
    town.population = 0;
    town.latitude = 0;
    town.longitude = 0;

    return town;
}

module.exports = Town;
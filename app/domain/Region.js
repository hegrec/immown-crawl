var  _ = require('lodash');

function Region() {
    var region = {};
    region.id = 0;
    region.createdAt = null;
    region.updatedAt = null;
    region.name = null;
    region.code = 0;
    region.capital = null;
    region.latitude = 0;
    region.longitude = 0;

    return region;
}

module.exports = Region;
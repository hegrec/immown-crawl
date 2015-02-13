var _ = require('lodash');

function Agency() {
    var agency = {};

    agency.name = null;
    agency.image = null;
    agency.address_1 = null;
    agency.address_2 = null;
    agency.telephone = null;
    agency.email = null;
    agency.website = null;
    agency.town = null;

    return agency;
}

module.exports = Agency;
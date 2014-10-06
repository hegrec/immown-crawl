var squel = require('squel');
var Hoek = require('hoek');
var _ = require('lodash');
function Base(db) {
    var tableName = 'base';
    var baseSchema = {
        id: Number,
        createdAt: Date,
        updatedAt: Date
    };

    /**
     * Custom query parameter find for domain models
     * queryParams = {
     *     sort: 'fieldName' OR '-fieldName' for DESC
     *     limit: 100
     * }
     * @param params
     * @param cb
     */
    function find(params, cb) {
        var select = squel.select().from(tableName),
            sortDirection = true; //ASC;

        if (_.isUndefined(cb)) {
            cb = params;
            params = {};
        }

        if (_.isString(params.sort)) {
            if (params.sort.charAt(0) == '-') {
                params.sort = params.sort.substr(1);
                sortDirection = false;
            }

            select.order(params.sort, sortDirection);
        }

        if (_.isNumber(params.limit)) {
            select.limit(params.limit);
        }

        var query = select.toString();
        console.log(query);
        db.query(query, function(err, rows, fields) {

            if (err) {
                return cb(err);
            }

            cb(null, rows);
        });
    }

    function get(id, cb) {
        db.query('SELECT * FROM ' + tableName + ' WHERE id=' + Number(id), function(err, rows, fields) {

            if (err) {
                return cb(err);
            }

            cb(null, rows);
        });
    }

    /**
     * Pass a datamap to each required column to create and persist a new domain model
     * @param data
     * @param cb
     */
    function create(data, cb) {

        var insert = squel.insert()
            .into(tableName);

        _.forOwn(data, function(val, key) {
           insert = insert.set(key, val);
        });

        console.log(insert);


       /* db.query(insert, function(err, rows, fields) {

            if (err) {
                return cb(err);
            }

            cb(null, rows);
        });*/

        setImmediate(function() {
           cb(null, {});
        });
    }

    function setTableName(newTableName) {
        tableName = newTableName;
    }

    function setSchema(modelSchema) {
        baseSchema = Hoek.applyToDefaults(baseSchema, modelSchema);
    }


    return {
        find: find,
        get: get,
        create: create,
        setTableName: setTableName,
        setSchema: setSchema
    };
}

module.exports = Base;
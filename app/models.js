module.exports = {
    orm: require("orm"),
    models: null,
    initialize: function (next){
        this.orm.connect("mysql://root@127.0.0.1/immodispo", function (err, db) {
            if (err) throw err;
            models.Region = db.define("core_region", {
                region_name: String,
                code: Number,
                capital: String, // FLOAT
                latitude: Number,
                longitude: Number
            });

            models.Department = db.define("core_department", {
                department_name: String,
                code: Number,

                capital: String,
                kml: String,
                latitude: Number,
                longitude: Number
            });
            models.Department.hasOne("region", models.Region, {
                reverse: "departments"
            });

            models.Town = db.define("core_town", {
                town_name: String,
                code: Number,
                kml: String, // FLOAT
                surface_area: Number,
                latitude: Number,
                longitude: Number,
                population: Number
            });
            models.Town.hasOne("department", models.Department, {
                reverse: "towns"
            });

            models.Agency = db.define("core_agency", {
                name: String,
                image: { required: false, type: "text"},
                street_address: String, // FLOAT
                telephone: String,
                email: String,
                website: String,
                fax: String
            });
            models.Agency.hasOne("town", models.Town, {
                reverse: "agencies"
            });


            models.Listing = db.define("core_listing", {
                found_date: { type: "date", time:true },
                updated_date: { type: "date", time:true },
                price: Number,
                description: String,
                identifier: String,
                num_rooms: Number,
                num_bathrooms: Number,
                num_toilets: Number,
                num_floors: Number,
                num_parking_space: Number,
                construction_type: String,
                listing_url: String,
                latitude: Number,
                longitude: Number,
                energy_rating: Number,
                carbon_rating: Number,
                entry_room_size: Number,
                basement_size: Number,
                attic_size: Number,
                has_garden: Boolean,
                has_pool: Boolean,
                has_kitchen: Boolean,
                in_subdivision: Boolean,
                land_surface: Number,
                living_room_surface: Number,
                num_bedrooms: Number,
                year_built: Number,
                total_surface: Number,
                is_rental: Boolean,
                feature_score: Number,
                views: Number
            });
            models.Listing.hasOne("town", models.Town, {
                reverse: "listings"
            });
            models.ListingImage = db.define("core_listingimage", {
                image: String
            });
            models.ListingImage.hasOne('listing', models.Listing, {reverse: 'images'})
            models.Listing.hasOne("agency", models.Agency, {
                reverse: "listings"
            });

            models.CachedCluster = db.define("core_cachedcluster", {
                code: Number,
                zoom_level: Number, // FLOAT
                latitude: Number,
                longitude: Number,
                cluster_count: Number
            });
            models.CachedCluster.hasOne("listing", models.Listing);
            models.CachedCluster.hasOne("town", models.Town);

            next(models);
            /*var Person = db.define("person", {
             name      : String,
             surname   : String,
             age       : Number, // FLOAT
             male      : Boolean,
             continent : [ "Europe", "America", "Asia", "Africa", "Australia", "Antartica" ], // ENUM type
             photo     : Buffer, // BLOB/BINARY
             data      : Object // JSON encoded
             }, {
             methods: {
             fullName: function () {
             return this.name + ' ' + this.surname;
             }
             },
             validations: {
             age: orm.enforce.ranges.number(18, undefined, "under-age")
             }
             });

             Person.find({ surname: "Doe" }, function (err, people) {
             // SQL: "SELECT * FROM person WHERE surname = 'Doe'"

             console.log("People found: %d", people.length);
             console.log("First person: %s, age %d", people[0].fullName(), people[0].age);

             people[0].age = 16;
             people[0].save(function (err) {
             // err.msg = "under-age";
             });
             });*/
        });
    }
}
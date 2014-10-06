function _guid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
}


function mysql_real_escape_string (str) {
    return str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function (char) {
        switch (char) {
            case "\0":
                return "\\0";
            case "\x08":
                return "\\b";
            case "\x09":
                return "\\t";
            case "\x1a":
                return "\\z";
            case "\n":
                return "\\n";
            case "\r":
                return "\\r";
            case "\"":
            case "'":
            case "\\":
            case "%":
                return "\\"+char; // prepends a backslash to backslash, percent,
            // and double/single quotes
        }
    });
}

module.exports = {
    guid:_guid,
    mysql_real_escape_string: mysql_real_escape_string,
    getImagefileName: function (imageURL) {
        if (imageURL.indexOf(".png") > -1) {
            return _guid() + ".png";
        } else if (imageURL.indexOf(".jpg") > -1) {
            return _guid() + ".jpg";
        }
        return false;
    }
}
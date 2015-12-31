// for scraper
var scraperjs = require('scraperjs');
var async = require('async');
var rest = require('restler');
var fs = require('fs');

var baseUrl = 'http://qiita.com';
var hatebuApiUrl = 'http://api.b.st-hatena.com/entry.count';

function getThemeUrls(callback) {
    async.reduce(Array.from({
        length: 19
    }, (v, k) => k), [], function(themes, page, nestCallBack) {
        scraperjs.StaticScraper.create(baseUrl + '/advent-calendar/2015/calendars?page=' + (page + 1))
            .delay(1000, function($) {
                return $;
            })
            .scrape(function($) {
                return $(".adventCalendarList_calendarTitle a").map(function() {
                    var title = $(this).text();
                    console.log(page + ": " + title);
                    var url = $(this).attr('href');
                    if (!url.match(/feed$/)) {
                        return {
                            title: title,
                            url: url
                        };
                    }
                }).get();
            }, function(results) {
                nestCallBack(null, themes.concat(results));
            })
    }, function(err, results) {
        callback(null, results);
    });
}

function getEntryUrls(theme, callback) {
    var themeUrl = baseUrl + theme['url'];
    scraperjs.StaticScraper.create(themeUrl)
        .delay(3000, function($) {
            return $;
        })
        .scrape(function($) {
            return $(".adventCalendarCalendar_day").map(function() {
                var day = $(".adventCalendarCalendar_date", this).text();
                var text = $(".adventCalendarCalendar_comment a", this).text();
                var url = $(".adventCalendarCalendar_comment a", this).attr("href");
                if (url !== undefined) {
                    if (!url.match(/^http/)) {
                        url = baseUrl + url;
                    }
                    return {
                        day: day,
                        text: text,
                        url: url
                    };
                }
            }).get();
        }, function(entries) {
            console.log(entries);
            callback(null, {
                themeTitle: theme['title'],
                themeCalendarUrl: theme['url'],
                entries: entries
            });
        })
}

function getHatebuCount(entry, callback) {
    rest.get(hatebuApiUrl, {
        query: {
            'url': entry['url']
        }
    }).on('complete', function(data, response) {
        if (data instanceof Error) {
            console.log('Error:', data.message);
            this.retry(1000);
        } else {
            var count = data ? data : 0;
            console.log(entry['day'] + "日目 " + entry['text'] + ": " + count);
            callback(null, {
                day: entry['day'],
                title: entry['text'],
                url: entry['url'],
                count: count
            });
        }
    });
}

function insertHatebuCount(theme, callback) {
    console.log("----------------------" + theme['themeTitle'] + "----------------------");
    var entries = theme['entries'];
    asyncMap(entries, getHatebuCount, function(err, entries) {
        callback(null, {
            themeTitle: theme['themeTitle'],
            themeCalendarUrl: theme['themeCalendarUrl'],
            entries: entries
        });
    });
}

function asyncMap(ary, iter, callback) {
    async.mapLimit(ary, 10, iter, function(err, results) {
        callback(null, results);
    });
}

async.waterfall(
    [
        getThemeUrls,
        function(results, callback) {
            asyncMap(results, getEntryUrls, callback);
        },
        function(results, callback) {
            asyncMap(results, insertHatebuCount, callback);
        }
    ], function(err, results) {
        fs.writeFile('results.json', JSON.stringify(results), function(err) {
            if (err) {
                console.log(err);
            }
            console.log("DONE");
        });
    });

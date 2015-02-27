var FeedParser = require('feedparser');
var htmlToText = require('html-to-text');
var P = require('bluebird');
var request = require('request');
var VoxClient = require('vox-client');


var client = new VoxClient({
    agentString: 'hackernewsfeed',
    nick: 'hackernewsfeed'
});


client.connect()
  .then(function() {
    var feedparser = new FeedParser();

    console.info('Reading RSS feed...');
    var req = request('http://fulltextrssfeed.com/feeds.feedburner.com/newsyc50?format=xml');

    req.on('error', function(error) {
      console.error('Error', error);
    })

    req.on('response', function(res) {
      console.info('Read RSS feed.');
      var stream = this;
      if (res.statusCode != 200) {
        return this.emit('error', new Error('Bad status code'));
      }
      stream.pipe(feedparser);
    });

    feedparser.on('error', function(error) {
      console.error('Error', error);
    })

    var promises = [];

    feedparser.on('data', function(item) {
      var link = item.link;
      console.info('Item %s', item.link);
      var p = client.db.getRow('hackernews-items', link)
        .then(function(row) {
          if (row) {
            console.info('Skipping', item.link);
            return;
          }
          console.info('Posting', item.link);
          var description = '';
          if (item.description) {
            var text = htmlToText.fromString(item.description);
            description = text.substr(0, 1024);
            if (text.length > description.length) {
              description += '...';
            }
          }
          return client.post({
              title: item.title,
              userUrl: item.link,
              text: description
          })
        })
        .then(function() {
          return client.db.insertRow('hackernews-items', { key: link, value: Date.now() });
        })
      promises.push(p);
    })

    feedparser.on('end', function() {
      P.settle(promises)
        .finally(function() {
          process.exit(0);
        });
    })
  })

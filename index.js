var request = require('request');
var ICalParser = require('cozy-ical').ICalParser;
var mailConfig = require('./mail-config')
var mailer = require('nodemailer').createTransport(mailConfig);

request('http://calendar.google.com/calendar/ical/aurumintern@gmail.com/public/basic.ics', function(err, response, body) {
  var parser = new ICalParser();
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  parser.parseString(body, function (err, result) {
    result.subComponents.forEach(function(c) {
      var event = c.model;
      if (
        event.startDate
          && event.summary.match(/(pr)?øv(e|else|ing)/i)
          && event.startDate.getYear() == tomorrow.getYear()
          && event.startDate.getMonth() == tomorrow.getMonth()
          && event.startDate.getDate() == tomorrow.getDate()
      ) {
        var matches = event.description.match(/([12])\.? *(sopran|alt|tenor|bass).*(kake|kaffe|pausekos)/i);
        if (matches) {
          var stemme = matches[2].toLowerCase();
          var stemmegruppe = matches[1] + '. ' + stemme;
          mailer.sendMail({
            from: 'Kake Robot <kakerobot@kammerkoret-aurum.no>',
            to: stemme + matches[1] + '@kammerkoret-aurum.no',
            subject: stemmegruppe + ' har kakeansvar!',
            text: 'Hei!\n\nHusk at ' + stemmegruppe + ' skal ta med kaffe/kake/snop etc på øvelsen i morgen!\n\nmvh,\nAurums trofaste kakerobot'
          });
        }
      }
    });
  });
});

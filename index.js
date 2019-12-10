const request = require('request')
const ICalParser = require('cozy-ical').ICalParser
const nodemailer = require('nodemailer')
const { WebClient } = require('@slack/web-api')

/*
  Config file should look like this:
  You need one slack token to list groups and one bot token to post a message.

module.exports = {
  calendarFeed: 'http://url.com',
  cc: 'address@cc.com, anotheraddress@cc.com',
  mail: {
    host: 'email.host.com',
    port: 465,
    secure: true,
    auth: {
      user: 'username',
      pass: 'password'
    }
  },
  slack: {
    token: 'abc-def-etc',
    botToken: 'abc-def-etc',
    channel: 'channel-name'
  }
}

*/

const config = require('./config')

const kakeRegex = /(pr)?øv(e|else|ing)/i

request(config.calendarFeed, (err, response, body) => {
  const parser = new ICalParser()
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  parser.parseString(body, (err, result) => {
    result.subComponents.forEach(async (c) => {
      const event = c.model

      const isTomorrow = event.startDate
            && event.summary.match(kakeRegex)
            && event.startDate.getYear() == tomorrow.getYear()
            && event.startDate.getMonth() == tomorrow.getMonth()
            && event.startDate.getDate() == tomorrow.getDate()

      const isToday = event.startDate
            && event.summary.match(kakeRegex)
            && event.startDate.getYear() == today.getYear()
            && event.startDate.getMonth() == today.getMonth()
            && event.startDate.getDate() == today.getDate()

      if (isToday || isTomorrow) {
        const matches = event.description.match(/([12])\.? *(sopran|alt|tenor|bass).*(kake|kaffe|pausekos)/i);
        if (matches) {
          const stemme = matches[2].toLowerCase()
          const stemmegruppe = matches[1] + '. ' + stemme
          const messageText = `I ${isToday ? 'dag' : 'morgen'} er det øvelse${event.location ? ' på ' + event.location : ''} og det er ${stemmegruppe} som skal ta med kaffe/kake/snop/etc.`

          if (isTomorrow) {
            let mail = {
              from: 'Kake Robot <kakerobot@kammerkoret-aurum.no>',
              to: stemme + matches[1] + '@kammerkoret-aurum.no',
              subject: stemmegruppe + ' har kakeansvar!',
              text: `Hei!\n\n${messageText}\n\nmvh,\nAurums trofaste kakerobot`
            }

            if (config.cc) {
              mail.cc = config.cc
            }

            const mailer = nodemailer.createTransport(config.mail)
            mailer.sendMail(mail)
          }

          const slackClient = new WebClient(config.slack.token)
          const slackbotClient = new WebClient(config.slack.botToken)

          let groupId
          try {
            const slackGroups = await slackClient.usergroups.list({ include_users: false })
            const groupName = stemme.slice(0, 1) + matches[1]
            groupId = slackGroups.usergroups.filter(g => g.handle == groupName)[0].id
          } catch (e) { }

          const slackMessage = (groupId ? `<!subteam^${groupId}> ` : '') + `Hei! ${messageText}`

          slackbotClient.chat.postMessage({
            text: slackMessage,
            channel: config.slack.channel
          })
        }
      }
    })
  })
})

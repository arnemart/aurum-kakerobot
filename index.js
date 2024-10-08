const ical = require('node-ical')
const nodemailer = require('nodemailer')
const { WebClient } = require('@slack/web-api')

/*
Config file should look like this:
You need one slack token to list groups and one bot token to post a message.

export default {
  sendEmail: true,
  sendSlackMessage: true
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

async function doTheThing() {
  const ovelseRegex = /(^|\n|\W)(pr)?øv(e|else|ing)/i
  const ikkeOvelseRegex = /\bikke (pr)?øv(e|else|ing)/i
  const korumRegex = /korum/i
  const ikkeKorumRegex = /ikke korum/i

  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const events = Object.values(await ical.async.fromURL(config.calendarFeed))
    .reduce((events, event) => event.recurrences ? events.concat(Object.values(event.recurrences)) : events.concat(event), [])

  const korumTomorrow = events.find(findEvent(tomorrow, korumRegex, ikkeKorumRegex))
  const rehersalTomorrow = events.find(findEvent(tomorrow, ovelseRegex, ikkeOvelseRegex))
  const korumToday = events.find(findEvent(today, korumRegex, ikkeKorumRegex))
  const rehersalToday = events.find(findEvent(today, ovelseRegex, ikkeOvelseRegex))

  if (rehersalTomorrow) {
    sendSlackMessage(rehersalTomorrow, korumTomorrow, false)
    sendEmail(rehersalTomorrow, korumTomorrow)
  }

  if (rehersalToday) {
    sendSlackMessage(rehersalToday, korumToday, true)
  }
}

doTheThing()

function findEvent(date, matchThis, butDontMatchThis = null) {
  return event => event.start
    && event.start.getYear() == date.getYear()
    && event.start.getMonth() == date.getMonth()
    && event.start.getDate() == date.getDate()
    && event.summary.match(matchThis)
    && !event.summary.match(butDontMatchThis)
}

async function sendSlackMessage(rehersalEvent, korumEvent, isToday) {
  const { message, stemme, number } = createMessage(rehersalEvent, korumEvent, isToday)

  let groupId
  try {
    const groupName = stemme.slice(0, 1) + number
    const slackClient = new WebClient(config.slack.token)
    const slackGroups = await slackClient.usergroups.list({ include_users: false })
    groupId = slackGroups.usergroups.filter(g => g.handle == groupName)[0].id
  } catch (e) { }

  const slackMessage = `${groupId ? `<!subteam^${groupId}> ` : ''}Hei! ${message}`

  if (config.sendSlackMessage) {
    const slackbotClient = new WebClient(config.slack.botToken)
    slackbotClient.chat.postMessage({
      text: slackMessage,
      channel: config.slack.channel
    })
  } else {
    console.log('Slack:', slackMessage)
  }
}

function sendEmail(rehersalEvent, korumEvent) {
  const { message, stemme, number } = createMessage(rehersalEvent, korumEvent, false)

  if (stemme) {
    let mail = {
      from: 'Kake Robot <kakerobot@kammerkoret-aurum.no>',
      to: `${stemme}${number}@kammerkoret-aurum.no`,
      subject: `${number}. ${stemme} har kakeansvar!`,
      text: `Hei!\n\n${message}\n\nmvh,\nAurums trofaste kakerobot`
    }

    if (config.cc) {
      mail.cc = config.cc
    }

    if (config.sendEmail) {
      const mailer = nodemailer.createTransport(config.mail)
      mailer.sendMail(mail)
    } else {
      console.log('Mail:', mail)
    }
  }
}

function createMessage(event, korumEvent, isToday) {
  const location = event.location ? (event.location.match(/kirken?\b/i) ? ' i ' : ' på ') + event.location.split(',')[0] : ''
  const korum = korumEvent ? ` korum${startTime(korumEvent)} og` : ''
  const messageStart = `I ${isToday ? 'dag' : 'morgen'} er det${korum} øvelse${startTime(event)}${location}`
  const matches = event.description.match(/([12])\.? *(sopran|alt|tenor|bass).*(kake|kaffe|pausekos)/i);
  if (matches) {
    const stemme = matches[2].toLowerCase()
    const number = matches[1]
    return {
      message: `${messageStart}, og det er ${number}. ${stemme} som skal ta med kaffe/kake/snop/etc. og rigge til øving ${preStartTime(event)}.`,
      stemme,
      number
    }
  } else {
    return {
      message: `${messageStart}.`
    }
  }
}

function startTime(event) {
  return event.start ? ` klokka ${event.start.getHours() < 10 ? '0' + event.start.getHours() : event.start.getHours()}:${event.start.getMinutes() < 10 ? '0' + event.start.getMinutes() : event.start.getMinutes()}` : ''
}

function preStartTime(event) {
  if (event.start) {
    const prestart = new Date(event.start)
    prestart.setMinutes(prestart.getMinutes() - 15)
    return `fra ${prestart.getHours() < 10 ? '0' + prestart.getHours() : prestart.getHours()}:${prestart.getMinutes() < 10 ? '0' + prestart.getMinutes() : prestart.getMinutes()}`
  } else {
    return "15 min før øvingsstart"
  }
}

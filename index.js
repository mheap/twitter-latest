require("dotenv").config();

const Twitter = require("twitter");
const moment = require("moment");
const Bottleneck = require("bottleneck");
const Table = require("cli-table3");
const table = new Table({
  head: ["User", "Last Tweet", "Last Date", "Profile"],
  colWidths: [20, 30, 10, 50],
  wordWrap: true
});

const limiter = new Bottleneck({
  reservoir: 5, // initial value
  reservoirRefreshAmount: 15,
  reservoirRefreshInterval: 900 * 1000, // Every 15 mins

  // also use maxConcurrent and/or minTime for safety
  maxConcurrent: 1,
  minTime: 500
});

const params = { screen_name: process.argv[2], count: 200 };

if (!params.screen_name) {
  console.log(`Usage: ${process.argv[1]} <username>`);
  process.exit(1);
}

const requiredEnv = [
  "TWITTER_CONSUMER_KEY",
  "TWITTER_CONSUMER_SECRET",
  "TWITTER_ACCESS_TOKEN",
  "TWITTER_ACCESS_SECRET"
];

for (let req of requiredEnv) {
  if (!process.env[req]) {
    console.log(`${req} is a required environment variable`);
    console.log(`You can get credentials at https://developer.twitter.com/en/apply-for-access`);
    process.exit(1);
  }
}

const client = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN,
  access_token_secret: process.env.TWITTER_ACCESS_SECRET
});

let allUsers = [];

function g(cursor) {
  if (cursor) {
    params.cursor = cursor;
  }

  client.get("friends/list", params, function(error, tweets, response) {
    if (error) {
      console.error(error);
      return;
    }

    if (tweets.next_cursor_str == 0 || tweets.next_cursor_str == -1) {
      outputUsers(allUsers);
      return;
    }

    tweets.users.forEach(u => allUsers.push(u));
    limiter.schedule(g, tweets.next_cursor_str);
  });
}

function outputUsers(users) {
  for (i = 0; i < users.length; i++) {
    const u = users[i];
    if (u.status) {
      const tweetTime = moment(
        u.status.created_at,
        "ddd MMM D HH:mm:ss ZZ YYYY"
      );
      users[i].last_tweet = tweetTime.format("X");
    } else {
      users[i].no_tweet = true;
    }
  }

  users.sort((a, b) => {
    if (a.no_tweet) {
      return -1;
    }
    if (b.no_tweet) {
      return 1;
    }

    if (a.last_tweet > b.last_tweet) {
      return 1;
    }
    if (a.last_tweet < b.last_tweet) {
      return -1;
    }
    return 0;
  });

  users = removeDuplicates(users, "screen_name");

  users.forEach(u => {
    if (!u.status) {
      return;
    }
    table.push([
      u.screen_name,
      u.status.text,
      u.status.created_at,
      `https://twitter.com/${u.screen_name}`
    ]);
  });

  console.log(table.toString());
}

function removeDuplicates(myArr, prop) {
  return myArr.filter((obj, pos, arr) => {
    return arr.map(mapObj => mapObj[prop]).indexOf(obj[prop]) === pos;
  });
}

limiter.schedule(g);

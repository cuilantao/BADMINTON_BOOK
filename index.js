const puppeteer = require("puppeteer");
const moment = require("moment");

// Hard code building login information here. To support mulitiple people booking, we will store crendentials in an array.

// REPLACE WITH YOUR CRENDETIAL
const CRENDETIALS = {  };

// REPLACE WITH YOUR INFO
const TWILIO_ACCOUNT_SID = "";
const TWILIO_AUTH_TOKEN = "";
const TWILIO_NUMBER = "";
const timeout = 5000;

const smsClient = require("twilio")(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const nextAvailableDate = moment().add(2, "days");
const formattedDate = nextAvailableDate.format("dddd, MMMM DD, YYYY");

const DATE_SELECTOR = `td[title="${nextAvailableDate.format(
  "dddd, MMMM DD, YYYY",
)}"]`;
console.log(
    `Searching for Court Bookings on ${formattedDate}.`,
);

async function scrollToView(page, givenSelector) {
  await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    element.scrollIntoView({ behavior: 'smooth' });
  }, givenSelector);
}

function computeTimeSelectorBasedOnRowAndColumnNumber(isStartTime, row, col) {
  let pickerName;
  if (isStartTime) {
    pickerName = 'StartTimePicker';
  }
  else {
    pickerName = 'EndTimePicker';
  }
  return `#ctl00_ContentPlaceHolder1_${pickerName}_timeView_tdl > tbody > tr:nth-child(${row + 1}) > td:nth-child(${col})`
}

/**
 * 
 * @param {*} page 
 * @param {*} amenityUrl : url to court booking
 * @param {*} startTimeRowPos : the row number for the time you want.
 * @param {*} startTimeColPos : the column number for the time you want.
 */
async function bookTimeSlot(page, amenityUrl, startTimeRowPos, startTimeColPos) {
  // Select 7 days from now.
  try {
    await page.waitForSelector(DATE_SELECTOR, { timeout: 5000 });
    // Scroll the element into view
    await scrollToView(page, DATE_SELECTOR);
    await page.click(DATE_SELECTOR, { timeout: 5000 });
    await page.waitForResponse((response) => response.url().toLowerCase() == amenityUrl.toLowerCase());
    await new Promise((r) => setTimeout(r, 1000));
  }
  catch (e) {
    console.log("DATE SELECTOR FAILED", startTimeRowPos, startTimeColPos, amenityUrl, e);
  }

  try{
    const startTimePicker = '#ctl00_ContentPlaceHolder1_StartTimePicker_dateInput';
    await page.waitForSelector(startTimePicker, { timeout: 5000 });
    await scrollToView(page, startTimePicker);
    await page.click(startTimePicker, { timeout: 5000 });
  
  }
  catch (e) {
    console.log('START TIME PICKER FAILED', startTimeRowPos, startTimeColPos, amenityUrl, e);
  }

  try {
    const startTimeSelector = computeTimeSelectorBasedOnRowAndColumnNumber(true, startTimeRowPos, startTimeColPos);
    await page.waitForSelector(startTimeSelector, { timeout: 5000 });
    await scrollToView(page, startTimeSelector)
    await page.click(startTimeSelector, { timeout: 5000 });
    // Wait for time selection request to finish
    await page.waitForResponse((response) => response.url().toLowerCase() == amenityUrl.toLowerCase());
  }
  catch (e) {
    console.log('TIME SELECTION FAILED', startTimeRowPos, startTimeColPos, amenityUrl, e);
  }

  try {
    // Click the save button
    const saveButton = '#ctl00_ContentPlaceHolder1_FooterSaveButton span.b-t';
    await page.waitForSelector(saveButton, { timeout: 5000 });
    await scrollToView(page, saveButton)
    await page.click(saveButton, { timeout: 5000 });
    await page.waitForResponse((response) => response.url().toLowerCase() == amenityUrl.toLowerCase());
    await new Promise((r) => setTimeout(r, 100));
  }
  catch (e) {
    console.log('SAVE BUTTON FAILED', startTimeRowPos, startTimeColPos, amenityUrl, e);
  }
}

async function start(username, password) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const navigationPromise = page.waitForNavigation();

  await page.goto("https://buildinglink.com/v2/global/login/login.aspx");

  await page.setViewport({ width: 1024, height: 900 });

  // Log in
  await page.waitForSelector("#UserName", timeout);
  await page.click("#UserName");
  await page.type("#UserName", username);

  await page.waitForSelector("#Password", timeout);
  await page.click("#Password");
  await page.type('#Password', password);

  await page.waitForSelector('#LoginButton', timeout);
  await page.click('#LoginButton');
  await navigationPromise;
  await new Promise((r) => setTimeout(r, 1000));

  let courtBUrl = 'https://buildinglink.com/v2/tenant/amenities/NewReservation.aspx?amenityId=30440&from=0&selectedDate=';
  // After Log in, can directly go to Court B by link. The link never changes.

  // 4, 1 here means we want to select 8PM as the start time.
  await page.goto(courtBUrl);
  await navigationPromise;
  await new Promise((r) => setTimeout(r, 1000));
  await bookTimeSlot(page,courtBUrl, 3, 4);
  console.log('REQ 1 SENT');

  // Just hardcode here, don't care if the previous request succeeded or not. Will just try to book 9-10PM for court B.
  await page.goto(courtBUrl);
  await navigationPromise;
  await new Promise((r) => setTimeout(r, 1000));
  await bookTimeSlot(page,courtBUrl, 4, 1);
  console.log('REQ 2 SENT');

  // Now book court A 8-9PM
  let courtAurl = 'https://buildinglink.com/v2/tenant/amenities/NewReservation.aspx?amenityId=14261&from=0&selectedDate=';
  await page.goto(courtAurl);
  await navigationPromise;
  await new Promise((r) => setTimeout(r, 1000));
  await bookTimeSlot(page,courtAurl, 3, 4);
  console.log('REQ 3 SENT');

  // Now book court A 9-10PM
  await page.goto(courtAurl);
  await navigationPromise;
  await new Promise((r) => setTimeout(r, 1000));
  await bookTimeSlot(page,courtAurl, 4, 1);
  console.log('REQ 4 SENT');

  await page.close();
  await browser.close();
}

// Code to execute the booking logic.
async function main() {
  let hasError = false;
  for (const [username, password] of Object.entries(CRENDETIALS)) {
    for (let i = 0; i < 2; i++) {
      try {
        // Repeat booking action for 2 times, in case we run into network errer.
        await start(username, password);
      }
      catch (e) {
        hasError = true;  
        console.log(e);
      }
    }
  }

  // Send out the booking msg. REPLACE WITH YOUR INFO
  smsClient.messages
  .create({
    body: `Court booking finished ${hasError ? "with error, please check" : "successfully"}`,
    from: TWILIO_NUMBER,
    to: "",
  })
  .then(message => console.log("Sent message", message.sid));
}

main();

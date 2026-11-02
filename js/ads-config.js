// Google Ads conversion settings.
// googleAdsId is the account tag ID. js/campaign.js loads gtag and sends
// gtag('config', id) when this is a real AW- number, so Tag Assistant can see it.
// A label that is still REPLACE_ME does not send a conversion event and does
// not mark a pending token completed.
//
// labels.homeownerConsultation: label for "Consultation Form Submit".
//   Sent only from /smart-living/thank-you after that form is submitted.
// labels.builderMeeting: a separate label for the builder meeting request.
//   Sent only from /builder-partners/thank-you. It must stay a placeholder
//   until that separate conversion action exists, so the builder page does
//   not send the homeowner consultation conversion.
window.JACKNAT_ADS = {
  googleAdsId: "AW-18552161836",
  labels: {
    homeownerConsultation: "REPLACE_ME",
    builderMeeting: "REPLACE_ME"
  }
};

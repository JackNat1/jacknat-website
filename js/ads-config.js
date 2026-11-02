// Google Ads conversion settings.
// googleAdsId is the account tag ID. js/campaign.js loads gtag and sends
// gtag('config', id) on each page so Tag Assistant can see the tag.
// Each thank-you page sends a conversion only for its own label, and only
// after that form was accepted. A label left as REPLACE_ME does not fire
// and does not complete a pending token.
//
// labels.homeownerConsultation: "Smart Living - Homeowner Consultation Lead"
//   send_to AW-18552161836/STqxCNC2z7AdEKyMro5F
//   Fired only from /smart-living/thank-you after homeowner-consultation.
// labels.builderMeeting: "Smart Living - Builder Partner Meeting Lead"
//   send_to AW-18552161836/IMFyCNO2z7AdEKyMro5F
//   Fired only from /builder-partners/thank-you after builder-meeting.
window.JACKNAT_ADS = {
  googleAdsId: "AW-18552161836",
  labels: {
    homeownerConsultation: "STqxCNC2z7AdEKyMro5F",
    builderMeeting: "IMFyCNO2z7AdEKyMro5F"
  }
};

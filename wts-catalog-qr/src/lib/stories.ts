import type { ProductStory } from '../types';

const STORIES: Record<string, ProductStory> = {
  adsense: {
    before: 'Ad units sit empty because the site was never claimed or policy-checked.',
    after: 'A consultant walks the setup so you know what Google will and will not pay.',
  },
  aidoc: {
    before: 'Contracts and menus sit in one language while staff guess the rest.',
    after: 'AI-assisted hours turn a document around the same afternoon.',
  },
  banner: {
    before: 'Promos look like stretched screenshots of the homepage.',
    after: 'A sized creative that actually fits the ad slot and the offer.',
  },
  blog3: {
    before: 'The blog is a graveyard of two posts from 2022.',
    after: 'Three readable pieces give you a publishing rhythm you can keep.',
  },
  canvam: {
    before: 'Every flyer starts from a blank page and a watermark.',
    after: 'Canva Pro templates and brand kits — month to month if you want out.',
  },
  canvay: {
    before: 'Monthly design tools add up and nobody cancels the trial.',
    after: 'A year of Canva Pro at the printed catalog rate.',
  },
  carlist: {
    before: 'Stock sits in chat threads and Facebook albums.',
    after: 'One listing page per car that a buyer can share.',
  },
  copy10k: {
    before: 'Flagship pages are still outline bullets.',
    after: 'A long, structured copy pack you can drop onto the site.',
  },
  copy1k: {
    before: 'The hero line is still “Welcome to our website”.',
    after: 'A short block written to the offer, not the template.',
  },
  copy25k: {
    before: 'Service pages trail off after one paragraph.',
    after: 'A mid-length pack that covers the section without padding.',
  },
  copy5k: {
    before: 'The about page is a LinkedIn bio pasted twice.',
    after: 'A full page of copy with room for proof and a CTA.',
  },
  gbp: {
    before: 'Google shows the wrong hours and a photo of the alley.',
    after: 'The profile is claimed, filled, and ready for reviews.',
  },
  logoai: {
    before: 'The “logo” is a default font on a PNG.',
    after: 'A fast AI-assisted mark you can put on a card this week.',
  },
  logodes: {
    before: 'The brand looks different in every WhatsApp forward.',
    after: 'A designer-led mark with files you can actually reuse.',
  },
  menu: {
    before: 'Guests photograph a stained paper menu under yellow lights.',
    after: 'A designed menu — print or QR — that matches the kitchen tonight.',
  },
  nfc: {
    before: 'Paper cards go into a pocket and never get typed in.',
    after: 'Tap the card, land on the profile, skip the re-type.',
  },
  nfcc: {
    before: 'The metal card looks generic next to the shop sign.',
    after: 'A customized tap card that matches the brand, not the blank.',
  },
  onsite: {
    before: 'The website uses three photos from the landlord’s listing.',
    after: 'Someone shows up, shoots the room, and you stop borrowing pictures.',
  },
  qrcd: {
    before: 'The QR on the card opens a broken Bitly from 2019.',
    after: 'A designed code that points at the page you actually want scanned.',
  },
  rss: {
    before: 'Every site is updated by hand, then forgotten.',
    after: 'Feeds so new posts show up in one place instead of five logins.',
  },
  seo12: {
    before: 'Twelve keywords, zero pages that could rank for them.',
    after: 'A year-shaped article series instead of one lonely blog post.',
  },
  seo3: {
    before: 'Search sends people to a directory, not to you.',
    after: 'Three researched articles aimed at the queries you already lose.',
  },
  smebm: {
    before: 'Marketing is whatever the owner did on Sunday night.',
    after: 'A monthly (or yearly) mentoring cadence with a named next step.',
  },
  stock10: {
    before: 'Every page uses the same handshake stock photo.',
    after: 'Ten usable images you can put on the site without a copyright scare.',
  },
  stockseo: {
    before: 'Article images are random and unnamed.',
    after: 'Ten photos picked for the topic so the page looks finished in search.',
  },
  vcpro: {
    before: 'The vCard attachment never opens on the other phone.',
    after: 'A virtual card people can save without installing your app.',
  },
  wpdivi: {
    before: 'The business lives in Facebook and a Google sheet.',
    after: 'A full WordPress + Divi site you can hand to staff.',
  },
  wphome: {
    before: 'There is a domain and a “coming soon” page.',
    after: 'A homepage with three modules and a reason to click.',
  },
  wpmod: {
    before: 'The site is live but one section is still lorem ipsum.',
    after: 'One extra Divi module, scoped, instead of a whole rebuild.',
  },
  xlseo: {
    before: 'The Thai (or Lao) page is a machine dump nobody proofed.',
    after: 'One piece rewritten so it can be found, not just translated.',
  },
  xlseoy: {
    before: 'New EN pages never get a sister page in the other language.',
    after: 'A yearly translation cadence so the site stays bilingual.',
  },
};

const FALLBACK: ProductStory = {
  before: 'The printed page is clear. The next step is still a phone call.',
  after: 'Scan, pick options, and take the same SKU into the client portal to pay or quote.',
};

export function storyFor(slug: string): ProductStory {
  return STORIES[slug] || FALLBACK;
}

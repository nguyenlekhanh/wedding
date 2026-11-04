'use strict';

/**
 * Scripted fallbacks — used when AI is disabled, paused, slow, failing, or the
 * reply sanitises to nothing. They only interpolate real facts.
 */

function pick(list, seed) {
  if (!list.length) return '';
  const idx = Number.isFinite(seed) ? Math.abs(Math.floor(seed)) % list.length : Math.floor(Math.random() * list.length);
  return list[idx];
}

// American reception voice: short, spoken, warm, a little playful.
const EN = {
  welcome: [
    'Hey, {name} just walked in — welcome to the party, everybody say hi!',
    '{name} is here! Grab a drink and get comfortable, we are just getting started.',
    'Look who made it — {name}! Glad you are here tonight.'
  ],
  gift: [
    'Thank you {name} for the {gift} — that is love right there.',
    'Big round of applause for {name} — {count} {gift} for the newlyweds!',
    '{name} just sent {gift}. You are making this night, thank you!'
  ],
  gift_multi: [
    'Look at this room — thank you {names}, you all are too kind.',
    'Wow, {names} — the newlyweds are feeling the love tonight. Thank you!'
  ],
  ceremony: {
    kiss: 'Sealed with a kiss — let us hear it for the happy couple!',
    cheers: 'Glasses up, everybody — one, two, three, cheers!',
    dance: 'The floor is officially open — get out there and show us something!',
    cake: 'Time to cut the cake — and yes, that deserves a cheer!',
    champagne: 'Pouring the champagne — make some noise for these two!',
    petal: 'A shower of roses for the newlyweds — what a beautiful moment.',
    marry: '{name} is the new groom — let us hear it for the happy couple!'
  },
  interaction: [
    'Good call, {name} — glad you are hanging with us tonight.',
    'Appreciate you, {name}! Keep those wishes coming, everybody.',
    '{name} in the chat — love that. Make some noise for them too!'
  ],
  speak_now: [
    'All right, let us hear some noise for {bride} and {groom} — make them feel it!',
    'If you are watching, drop a wish in the comments — the newlyweds are reading every one.',
    'Quick check: who is ready to dance tonight? Let me see those hands!',
    'One more round of applause for the best-looking couple in the room!'
  ],
  idle: [
    'Take a look around — {guests} people celebrating {bride} and {groom} tonight.',
    'Grab a drink, find your people, and let us keep this party moving.',
    'If you are enjoying the night, drop a wish in the comments for the newlyweds.',
    'The music is playing, the room looks great — this is a wedding to remember.'
  ],
  farewell: [
    'Thank you for celebrating with {bride} and {groom} — good night, everybody, get home safe!',
    'That is a wrap on an amazing night. Thank you all for coming out!'
  ]
};

// Optional Vietnamese pack: only used when the operator selects language = 'vi'.
// The MC ships with en-US and every template/UI string is English by default.
const VI = {
  welcome: [
    'Chào mừng {name} đã đến với tiệc cưới của {bride} và {groom}!',
    'Rất vui được đón {name} — mời bạn vào chung vui cùng gia đình.',
    '{name} vừa đến! Chào mừng bạn đến với bữa tiệc hạnh phúc nhất năm.'
  ],
  gift: [
    'Cảm ơn {name} đã mừng {count} {gift}! Cả hội trường xin chúc phúc cho bạn.',
    'Món quà thật ý nghĩa từ {name} — {gift}! Xin chúc bạn vạn sự như ý.',
    '{name} vừa gửi {gift}! Trăm năm hạnh phúc đến với tất cả mọi người.'
  ],
  gift_multi: [
    'Cảm ơn {names} đã dành những món quà quý giá cho cô dâu chú rể!',
    'Thật là hào phóng — xin cảm ơn {names} rất nhiều!'
  ],
  ceremony: {
    kiss: 'Cô dâu chú rể trao nhau nụ hôn — tình yêu đẹp như mơ!',
    cheers: 'Cả hội trường nâng ly! Một, hai, ba — dzô!',
    dance: 'Sàn nhảy đã mở — mời cả nhà cùng quẩy hết mình!',
    cake: 'Cắt bánh cưới nào — ngọt ngào cho trăm năm hạnh phúc!',
    champagne: 'Tháp sâm panh đang tràn đầy — nâng ly chúc mừng đôi uyên ương!',
    petal: 'Mưa hoa hồng cho cô dâu chú rể — thật lãng mạn!',
    marry: '{name} đã trở thành chú rể mới! Chúc mừng hạnh phúc đôi lứa!'
  },
  interaction: [
    'Tôi thấy {name} trong phần bình luận — cảm ơn bạn đã chung vui!',
    'Lời chúc thật dễ thương từ {name}! Cả nhà tiếp tục gửi lời chúc nhé.',
    'Phòng live đang rất sôi động — cảm ơn {name} rất nhiều!'
  ],
  speak_now: [
    'Hội trường đang im ắng quá, cả nhà cùng gửi một tràng pháo tay chúc mừng {bride} và {groom} nào!',
    'Nếu bạn đang xem, hãy để lại một lời chúc cho đôi uyên ương — cô dâu chú rể đang đọc từng lời đấy.',
    'Bật mí nhỏ về cặp đôi này: đến giờ họ vẫn nắm tay y như buổi hẹn đầu tiên.',
    'Cả nhà nâng ly nào — thêm một tràng cổ vũ cho cặp đôi hạnh phúc nhất hội trường!'
  ],
  idle: [
    'Trong lúc nhạc vang, cả nhà cùng nâng ly chúc mừng {bride} và {groom}.',
    'Một buổi tối thật đẹp — đã có {guests} khách cùng chung vui!',
    'Nếu bạn đang xem, hãy để lại một lời chúc cho đôi uyên ương nhé.',
    'Bánh cưới đã sẵn sàng, nhạc đang ngân — một đám cưới thật đáng nhớ.'
  ],
  farewell: [
    'Cảm ơn cả nhà đã chung vui cùng {bride} và {groom} — chúc mọi người bình an!',
    'Buổi tiệc khép lại nhưng tình yêu thì còn mãi. Hẹn gặp lại!'
  ]
};

function fill(template, ctx) {
  return String(template || '')
    .replace(/\{name\}/g, ctx.name || 'a guest')
    .replace(/\{names\}/g, ctx.names || ctx.name || 'everyone')
    .replace(/\{gift\}/g, ctx.gift || 'wedding gift')
    .replace(/\{count\}/g, String(ctx.count || 1))
    .replace(/\{groom\}/g, ctx.groom || 'the groom')
    .replace(/\{bride\}/g, ctx.bride || 'the bride')
    .replace(/\{guests\}/g, String(ctx.guests || 0));
}

function fallbackFor(kind, ctx, language = 'en', ceremony = null) {
  const pack = language === 'vi' ? VI : EN;
  if (kind === 'ceremony') {
    const line = pack.ceremony[ceremony] || pack.ceremony.kiss;
    return fill(line, ctx);
  }
  if (kind === 'gift_multi') return fill(pick(pack.gift_multi), ctx);
  const list = pack[kind] || pack.gift;
  return fill(pick(list), ctx);
}

module.exports = { fallbackFor, EN, VI };

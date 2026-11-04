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

const EN = {
  welcome: [
    '{name} just walked into the hall — welcome to {bride} and {groom}\'s wedding!',
    'A warm welcome to {name}! Come on in, the celebration is just getting started.',
    'Look who arrived — {name}! Welcome to the happiest party of the year.'
  ],
  gift: [
    'Thank you {name} for the {gift}! The whole hall is cheering for you.',
    'What a lovely gift from {name} — {count} {gift}! Blessings to you.',
    '{name} just sent {gift}! A hundred years of happiness to everyone here.'
  ],
  gift_multi: [
    'So many kind gifts — thank you {names}! The newlyweds are overjoyed.',
    'Look at that generosity! Thank you {names} for blessing this wedding.'
  ],
  ceremony: {
    kiss: 'The bride and groom share a kiss — true love on full display!',
    cheers: 'Glasses up, everyone! One, two, three — cheers!',
    dance: 'The dance floor is open — let us see those moves!',
    cake: 'The cake is cut — sweet wishes for a hundred years of happiness!',
    champagne: 'The champagne tower is flowing — a toast to the happy couple!',
    petal: 'Rose petals for the newlyweds — what a beautiful moment!',
    marry: '{name} is the new groom! Congratulations to the happy couple!'
  },
  interaction: [
    'I see you in the comments, {name} — thank you for joining the party!',
    'Lovely words from {name}! Keep the wishes coming, everyone.',
    'The chat is on fire tonight — thank you {name} for the love!'
  ],
  idle: [
    'While the music plays, let us raise a glass to {bride} and {groom}.',
    'What a beautiful evening — {guests} guests and counting!',
    'If you are enjoying the party, drop a wish in the comments for the newlyweds.',
    'The cake is waiting, the music is playing — this is a wedding to remember.'
  ],
  farewell: [
    'Thank you for celebrating with {bride} and {groom} — good night, everyone!',
    'The party is winding down, but the love keeps going. Safe travels, everyone!'
  ]
};

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

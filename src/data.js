// Static reference data: pin categories, Paris arrondissements + geocoding heuristic, seed content.
window.PinsData = (function () {
  const cats = {
    museum:     { label: 'museums',          fill: '#df91f2', ink: '#131313', soft: '#2b1c30' },
    restaurant: { label: 'restaurants',      fill: '#ff4dc9', ink: '#131313', soft: '#331d2b' },
    bakery:     { label: 'cafés + bakeries', fill: '#fff59e', ink: '#131313', soft: '#2d2b1d' },
    drinks:     { label: 'drinks + wine',    fill: '#d90000', ink: '#ffffff', soft: '#2f1616' },
    todo:       { label: 'things to do',     fill: '#aed900', ink: '#131313', soft: '#242b12' },
    shop:       { label: 'shops',            fill: '#f28500', ink: '#131313', soft: '#2f2214' },
    hotel:      { label: 'stays',            fill: '#abf5ed', ink: '#131313', soft: '#16292a' },
    experience: { label: 'experiences',      fill: '#7db4ff', ink: '#131313', soft: '#1b2434' }
  };

  const arrs = {
    '1er': [48.8635, 2.3350], '2e': [48.8680, 2.3410], '3e': [48.8630, 2.3620],
    '4e': [48.8550, 2.3600], '5e': [48.8455, 2.3500], '6e': [48.8495, 2.3340],
    '7e': [48.8570, 2.3120], '8e': [48.8720, 2.3110], '9e': [48.8770, 2.3400],
    '10e': [48.8750, 2.3580], '11e': [48.8600, 2.3790], '12e': [48.8400, 2.3900],
    '13e': [48.8290, 2.3560], '14e': [48.8300, 2.3270], '15e': [48.8420, 2.2990],
    '16e': [48.8580, 2.2760], '17e': [48.8840, 2.3130], '18e': [48.8900, 2.3450],
    '19e': [48.8830, 2.3830], '20e': [48.8650, 2.3980]
  };

  const hoods = {
    '1er': 'louvre', '2e': 'sentier', '3e': 'le marais', '4e': 'île saint-louis',
    '5e': 'latin quarter', '6e': 'saint-germain', '7e': 'invalides', '8e': 'champs-élysées',
    '9e': 'pigalle', '10e': 'canal saint-martin', '11e': 'oberkampf', '12e': 'bercy',
    '13e': 'butte aux cailles', '14e': 'montparnasse', '15e': 'vaugirard', '16e': 'trocadéro',
    '17e': 'batignolles', '18e': 'montmartre', '19e': 'la villette', '20e': 'belleville'
  };

  const clues = [
    ['canal saint-martin', '10e'], ['butte aux cailles', '13e'], ['saint-germain', '6e'],
    ['st germain', '6e'], ['latin quarter', '5e'], ['champs-élysées', '8e'], ['champs elysees', '8e'],
    ['île saint-louis', '4e'], ['ile saint-louis', '4e'], ['montmartre', '18e'], ['montparnasse', '14e'],
    ['batignolles', '17e'], ['belleville', '20e'], ['la villette', '19e'], ['le marais', '3e'],
    ['marais', '3e'], ['pigalle', '9e'], ['oberkampf', '11e'], ['bastille', '11e'], ['charonne', '11e'],
    ['trocadéro', '16e'], ['trocadero', '16e'], ['bercy', '12e'], ['vaugirard', '15e'],
    ['montorgueil', '2e'], ['sentier', '2e'], ['mouffetard', '5e'], ['martyrs', '9e'],
    ['rivoli', '1er'], ['louvre', '1er'], ['tuileries', '1er'], ['opéra', '9e'], ['opera', '9e'],
    ['invalides', '7e'], ['eiffel', '7e'], ['orsay', '7e'], ['république', '3e'], ['republique', '3e'],
    ['nation', '11e'], ['luxembourg', '6e'], ['bretagne', '3e'], ['vosges', '4e'], ['pantheon', '5e'],
    ['panthéon', '5e'], ['wagram', '17e'], ['clichy', '9e'], ['gambetta', '20e']
  ];

  const seed = [
    { n: "musée d'orsay", c: 'museum', a: '7e', la: 48.8600, ln: 2.3266, no: 'monet, van gogh, degas, renoir. book a skip-the-line guided tour (~2h) so you skip the queue and get context.', u: 'https://www.getyourguide.com', t: ['skip the line', '2 hours'], h: '9:30 – 18:00, closed mon', p: '~€16' },
    { n: "musée de l'orangerie", c: 'museum', a: '1er', la: 48.8638, ln: 2.3226, no: "monet's water lilies, in the round. small enough to do in an hour.", t: ['water lilies', 'quick visit'], h: '9:00 – 18:00, closed tue', p: '~€12.50' },
    { n: 'buddy buddy', c: 'bakery', a: '3e', la: 48.8615, ln: 2.3610, no: 'famous for the peanut butter latte. le marais breakfast.', t: ['peanut butter latte', 'breakfast'] },
    { n: 'mamiche', c: 'bakery', a: '9e', la: 48.8795, ln: 2.3450, no: 'known more for bread and sandwiches than croissants. go for the sandwich.', u: 'https://www.instagram.com/boulangeriemamiche?igsh=d3JwaGdoeTBma3Vs', t: ['bread', 'sandwiches'] },
    { n: 'la pompadour', c: 'bakery', a: '16e', la: 48.8560, ln: 2.2760, no: 'pâtisserie in the 16th — worth the detour if you end up out west.', t: ['pâtisserie'] },
    { n: "maison d'isabelle", c: 'bakery', a: '5e', la: 48.8508, ln: 2.3480, no: 'frequently ranked among the best croissants and pain au chocolat in paris.', u: 'https://vt.tiktok.com/ZSxscWQo8/', t: ['best croissant', 'pain au chocolat'] },
    { n: 'rôtisserie segar', c: 'restaurant', a: '5e', la: 48.8440, ln: 2.3510, no: 'rotisserie chicken sandwiches. lunch, standing up, no regrets.', u: 'https://vt.tiktok.com/ZSxsGrALR/', t: ['chicken sandwich', 'lunch'] },
    { n: 'brasserie martin', c: 'restaurant', a: '11e', la: 48.8635, ln: 2.3800, no: 'classic french bistro lunch, and affordable for what it is.', t: ['bistro', 'affordable'] },
    { n: 'patate', c: 'restaurant', a: '6e', la: 48.8520, ln: 2.3340, no: 'famous french fries. that is the whole pitch and it is enough.', u: 'https://vt.tiktok.com/ZSxsWEroW/', t: ['fries'] },
    { n: 'dumbo', c: 'restaurant', a: '10e', la: 48.8720, ln: 2.3560, no: 'smash burgers. the non-french meal you will want by day three.', u: 'https://vt.tiktok.com/ZSxs7h2TA/', t: ['smash burger'] },
    { n: 'le parizot', c: 'restaurant', a: '11e', la: 48.8650, ln: 2.3760, no: 'jambon-beurre. the platonic ideal of a €6 lunch.', u: 'https://vt.tiktok.com/ZSxs7J5mD/', t: ['jambon-beurre', 'cheap'] },
    { n: 'bistrot paul bert', c: 'restaurant', a: '11e', la: 48.8535, ln: 2.3860, no: 'famous steak frites. book ahead — this one actually fills up.', u: 'https://www.instagram.com/bistrotpaulbert?igsh=MTQ1dzhxbDIzdWJoOQ==', t: ['steak frites', 'book ahead'], h: 'dinner, closed sun + mon', p: '€€€' },
    { n: 'la petite charlotte', c: 'restaurant', a: '9e', la: 48.8780, ln: 2.3390, no: 'traditional home-style french cooking. small room, big plates.', t: ['home cooking'] },
    { n: 'au bon coin', c: 'restaurant', a: '18e', la: 48.8930, ln: 2.3480, no: 'well-priced french bistro up past montmartre.', u: 'https://www.instagram.com/bistrotauboncoinparis?igsh=MTV2bG16MzFxYWRlMw==', t: ['bistro', 'well-priced'] },
    { n: 'matsuri', c: 'restaurant', a: '7e', la: 48.8560, ln: 2.3200, no: 'conveyor-belt sushi. for the night nobody wants to decide.', u: 'https://vt.tiktok.com/ZSxs3ogGN/', t: ['conveyor sushi'] },
    { n: 'chez janou', c: 'restaurant', a: '3e', la: 48.8570, ln: 2.3670, no: 'famous chocolate mousse — they leave the whole bowl on the table.', u: 'https://www.chezjanou.com/la-carte', t: ['chocolate mousse', 'dessert'] },
    { n: 'folderol', c: 'drinks', a: '11e', la: 48.8690, ln: 2.3700, no: 'wine and ice cream only. that is the entire menu.', u: 'https://vt.tiktok.com/ZSxs3ogGN/', t: ['wine', 'ice cream'] },
    { n: 'causeries', c: 'drinks', a: '7e', la: 48.8570, ln: 2.3100, no: 'date-night spot: wine and vinyl records.', u: 'https://vt.tiktok.com/ZSxsTje5s/', t: ['wine', 'vinyl', 'date night'] },
    { n: 'eiffel tower', c: 'todo', a: '7e', la: 48.8584, ln: 2.2945, no: 'you know why. go once in daylight, once for the sparkle.', t: ['classic'] },
    { n: 'jardin des tuileries', c: 'todo', a: '1er', la: 48.8635, ln: 2.3270, no: 'green chairs, gravel, a whole afternoon if you let it.', t: ['park'] },
    { n: 'champs-élysées', c: 'todo', a: '8e', la: 48.8698, ln: 2.3075, no: 'walk it once, from the arc down toward concorde.', t: ['walk'] },
    { n: 'arc de triomphe', c: 'todo', a: '8e', la: 48.8738, ln: 2.2950, no: 'climb it for the twelve-avenue view — better than the tower.', t: ['viewpoint'] },
    { n: 'jardin du luxembourg', c: 'todo', a: '6e', la: 48.8462, ln: 2.3372, no: 'the best park to do nothing in. bring a pastry.', t: ['park'] },
    { n: 'rue des martyrs', c: 'todo', a: '9e', la: 48.8820, ln: 2.3400, no: 'great foodie street to wander with no plan.', t: ['food street', 'wander'] },
    { n: 'place des vosges', c: 'todo', a: '4e', la: 48.8556, ln: 2.3655, no: 'beautiful square and park in le marais. arcades all the way round.', t: ['square', 'marais'] },
    { n: 'sézane outlet', c: 'shop', a: '3e', la: 48.8690, ln: 2.3480, no: 'the outlet, not the boutique — last season at half price.', u: 'https://vt.tiktok.com/ZSxssKLbL/', t: ['outlet'] },
    { n: 'la grande épicerie', c: 'shop', a: '7e', la: 48.8515, ln: 2.3245, no: 'buy french butter and have it vacuum sealed for the flight home.', u: 'https://vt.tiktok.com/ZSxs785oN/', t: ['butter', 'vacuum seal'] },
    { n: 'sabre', c: 'shop', a: '3e', la: 48.8640, ln: 2.3670, no: 'cutlery!! the whole reason to leave room in the suitcase.', t: ['cutlery', 'gifts'] },
    { n: 'fotoautomat booth', c: 'experience', a: '4e', la: 48.8670, ln: 2.3630, no: 'analog photo booth. black and white, four frames, no retakes.', t: ['photos'] },
    { n: 'wine by the seine', c: 'experience', a: '4e', la: 48.8530, ln: 2.3550, no: 'sit on the quai with a bottle. bring a corkscrew, cups optional.', t: ['picnic', 'sunset'] },
    { n: 'eiffel tower sparkle', c: 'experience', a: '16e', la: 48.8620, ln: 2.2895, no: 'watch it sparkle on the hour after dark. trocadéro side.', t: ['night', 'free'] },
    { n: 'hotel du cygne', c: 'hotel', a: '1er', la: 48.8640, ln: 2.3480, no: 'double bed. very close to le marais.', u: 'https://expe.onelink.me/hnLd/dkumtl8a', t: ['double bed'], p: '$527 · aug 23–25' },
    { n: 'hôtel saint louis pigalle', c: 'hotel', a: '9e', la: 48.8815, ln: 2.3375, no: 'double bed, in pigalle.', u: 'https://expe.onelink.me/hnLd/hcaaoflg', t: ['double bed', 'pigalle'], p: '$729 · aug 23–25' },
    { n: 'ws marais', c: 'hotel', a: '3e', la: 48.8625, ln: 2.3620, no: 'double bed, right in le marais.', u: 'https://expe.onelink.me/hnLd/shgpyokh', t: ['double bed'], p: '$744 · aug 23–25' },
    { n: 'les patios du marais', c: 'hotel', a: '3e', la: 48.8610, ln: 2.3640, no: 'double bed. best price of the marais options.', u: 'https://expe.onelink.me/hnLd/nuk', t: ['double bed', 'best value'], p: '$618 · aug 23–25' },
    { n: 'hôtel du vieux saule', c: 'hotel', a: '3e', la: 48.8655, ln: 2.3630, no: 'double bed, quiet street in the 3rd.', u: 'https://expe.onelink.me/hnLd/nyeq3zwf', t: ['double bed'], p: '$649 · aug 23–25' }
  ];

  const seedTrips = [
    { id: 'paris', name: 'paris', start: '2026-08-23', end: '2026-08-25', fill: '#fff59e', geo: true },
    { id: 'tokyo', name: 'tokyo', start: '2027-03-02', end: '2027-03-12', fill: '#df91f2', geo: false },
    { id: 'amalfi', name: 'amalfi coast', start: '2027-06-14', end: '2027-06-21', fill: '#abf5ed', geo: false }
  ];

  const seedSpots = seed.map((s, i) => ({ id: s.n + '-' + i, idx: i, ...s, visited: false, trip: 'paris' }));

  return { cats, arrs, hoods, clues, seedSpots, seedTrips };
})();

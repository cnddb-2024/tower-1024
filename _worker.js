import handle from './functions/api/progress.js';

export default {
  fetch: function (request, env) {
    var url;
    try {
      url = new URL(request.url);
    } catch (e) {
      return new Response('Bad Request', { status: 400 });
    }
    if (url.pathname.indexOf('/api/') === 0) return handle();
    return env.ASSETS.fetch(request);
  }
};

/* Tema claro/oscuro: automático por defecto, conmutable y recordado. */
(function () {
  var KEY = 'gs-theme', root = document.documentElement;
  try { var t = localStorage.getItem(KEY); if (t) root.setAttribute('data-theme', t); } catch (e) {}
  function current() { var a = root.getAttribute('data-theme'); return a || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
  window.Theme = {
    current: current,
    toggle: function () {
      var n = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', n);
      try { localStorage.setItem(KEY, n); } catch (e) {}
      return n;
    }
  };
})();

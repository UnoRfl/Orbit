// A client whose every call resolves to { data: null, error: null }
const chain = () => new Proxy(function () {}, {
  get: (_, k) => k === 'then' ? (ok) => ok({ data: null, error: null }) : chain(),
  apply: () => chain(),
});
export const createClient = () => chain();

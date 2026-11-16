globalThis.fetch = () => { throw new Error('Network fetch forbidden in offline integration test'); };

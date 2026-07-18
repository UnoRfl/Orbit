/* Orbit — auto-split module. Part of the Orbit single-page app.
   See ARCHITECTURE.md for how the pieces fit together. */

import { h, render, Fragment } from 'preact';
import { useState, useEffect, useRef, useMemo, useCallback } from 'preact/hooks';
import htm from 'htm';
import { createClient } from '@supabase/supabase-js';
const html = htm.bind(h);
export { h, render, Fragment, htm, createClient, html };
export { useState, useEffect, useRef, useMemo, useCallback };

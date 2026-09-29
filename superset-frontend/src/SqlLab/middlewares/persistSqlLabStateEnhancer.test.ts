/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import fetchMock from 'fetch-mock';
import { createStore, combineReducers } from 'redux';
import { callApi } from '@superset-ui/core';
import sqlLabReducer from 'src/SqlLab/reducers/sqlLab';
import { initialState, successfulQuery } from 'src/SqlLab/fixtures';
import { persistSqlLabStateEnhancer } from './persistSqlLabStateEnhancer';

const resultsUrl = '/mock/sqllab/results/unsafe-int';

beforeAll(() => {
  fetchMock.mockGlobal();
  fetchMock.get(
    resultsUrl,
    '{ "data": [{ "object_id": 32198334098493770513452193445 }], "columns": [{ "column_name": "object_id", "name": "object_id", "type": "NUMERIC" }] }',
  );
});

afterAll(() => {
  fetchMock.hardReset();
});

afterEach(() => {
  window.featureFlags = {};
  localStorage.clear();
});

const buildStore = async () => {
  const { json: results } = await callApi({
    url: resultsUrl,
    method: 'GET',
    parseMethod: 'json-bigint',
  });
  const query = {
    ...successfulQuery,
    sqlEditorId: initialState.sqlLab.queryEditors[0].id,
    startDttm: Date.now(),
    inLocalStorage: true,
    results,
  };
  const [firstEditor, ...otherEditors] = initialState.sqlLab.queryEditors;
  const state = {
    sqlLab: {
      ...initialState.sqlLab,
      queryEditors: [{ ...firstEditor, inLocalStorage: true }, ...otherEditors],
      queries: { [query.id]: query },
      tables: [],
      editorTabLastUpdatedAt: Date.now(),
    },
  };
  const rootReducer = combineReducers({ sqlLab: sqlLabReducer });
  return createStore(
    rootReducer,
    state as unknown as ReturnType<typeof rootReducer>,
    persistSqlLabStateEnhancer,
  );
};

test.each([false, true])(
  'persists SQL Lab state with >2^53 integer results without throwing (SQLLAB_BACKEND_PERSISTENCE=%s)',
  async flag => {
    window.featureFlags = { SQLLAB_BACKEND_PERSISTENCE: flag };
    const store = await buildStore();
    expect(() => store.dispatch({ type: 'ANY_ACTION' })).not.toThrow();
    const persisted = localStorage.getItem('redux');
    expect(persisted).toContain('32198334098493770513452193445');
  },
);

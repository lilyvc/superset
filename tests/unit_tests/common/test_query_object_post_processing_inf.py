# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
from typing import Any

import numpy as np
import pytest
from pandas import DataFrame

from superset.common.query_object import QueryObject
from superset.utils.csv import df_to_escaped_csv


@pytest.mark.parametrize(
    "operation,data,expected",
    [
        (
            {
                "operation": "compare",
                "options": {
                    "source_columns": ["s"],
                    "compare_columns": ["c"],
                    "compare_type": "percentage",
                },
            },
            {"s": [10.0, 0.0, -5.0], "c": [0.0, 0.0, 0.0]},
            {"percentage__s__c": [np.nan, np.nan, np.nan]},
        ),
        (
            {
                "operation": "compare",
                "options": {
                    "source_columns": ["s"],
                    "compare_columns": ["c"],
                    "compare_type": "ratio",
                },
            },
            {"s": [10.0, 0.0, -5.0], "c": [0.0, 0.0, 0.0]},
            {"ratio__s__c": [np.nan, np.nan, np.nan]},
        ),
        (
            {"operation": "contribution", "options": {"orientation": "row"}},
            {"a": [5.0, 0.0, 1.0], "b": [-5.0, 0.0, 2.0]},
            {"a": [np.nan, np.nan, 1 / 3], "b": [np.nan, np.nan, 2 / 3]},
        ),
        (
            {"operation": "contribution", "options": {"orientation": "column"}},
            {"a": [5.0, -5.0], "b": [0.0, 0.0]},
            {"a": [np.nan, np.nan], "b": [np.nan, np.nan]},
        ),
    ],
    ids=["compare_pct", "compare_ratio", "contribution_row", "contribution_column"],
)
def test_exec_post_processing_zero_denominator_yields_nan(
    app_context: None,
    operation: dict[str, Any],
    data: dict[str, list[float]],
    expected: dict[str, list[float]],
) -> None:
    result = QueryObject(post_processing=[operation]).exec_post_processing(
        DataFrame(data)
    )

    assert not np.isinf(result.select_dtypes("number").to_numpy()).any()
    for column, values in expected.items():
        np.testing.assert_allclose(result[column].to_numpy(), values)


def test_exec_post_processing_csv_has_no_inf(app_context: None) -> None:
    result = QueryObject(
        post_processing=[
            {"operation": "contribution", "options": {"orientation": "row"}}
        ]
    ).exec_post_processing(DataFrame({"a": [5.0, 0.0, 1.0], "b": [-5.0, 0.0, 2.0]}))

    assert "inf" not in df_to_escaped_csv(result, index=False)


def test_exec_post_processing_replaces_inf_from_any_operation(
    app_context: None,
) -> None:
    result = QueryObject(
        post_processing=[{"operation": "sort", "options": {"by": "a"}}]
    ).exec_post_processing(DataFrame({"a": [1.0, np.inf, -np.inf]}))

    assert not np.isinf(result["a"].to_numpy()).any()
    assert result["a"].isna().sum() == 2

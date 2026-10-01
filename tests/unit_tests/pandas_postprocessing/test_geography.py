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
import pytest
from pandas import DataFrame

from superset.exceptions import InvalidPostProcessingError
from superset.utils.pandas_postprocessing import (
    geodetic_parse,
    geohash_decode,
    geohash_encode,
)
from tests.unit_tests.fixtures.dataframes import lonlat_df
from tests.unit_tests.pandas_postprocessing.utils import round_floats, series_to_list


def test_geohash_decode():
    # decode lon/lat from geohash
    post_df = geohash_decode(
        df=lonlat_df[["city", "geohash"]],
        geohash="geohash",
        latitude="latitude",
        longitude="longitude",
    )
    assert sorted(post_df.columns.tolist()) == sorted(
        ["city", "geohash", "latitude", "longitude"]
    )
    assert round_floats(series_to_list(post_df["longitude"]), 6) == round_floats(
        series_to_list(lonlat_df["longitude"]), 6
    )
    assert round_floats(series_to_list(post_df["latitude"]), 6) == round_floats(
        series_to_list(lonlat_df["latitude"]), 6
    )


def test_geohash_encode():
    # encode lon/lat into geohash
    post_df = geohash_encode(
        df=lonlat_df[["city", "latitude", "longitude"]],
        latitude="latitude",
        longitude="longitude",
        geohash="geohash",
    )
    assert sorted(post_df.columns.tolist()) == sorted(
        ["city", "geohash", "latitude", "longitude"]
    )
    assert series_to_list(post_df["geohash"]) == series_to_list(lonlat_df["geohash"])


def test_geodetic_parse():
    # parse geodetic string with altitude into lon/lat/altitude
    post_df = geodetic_parse(
        df=lonlat_df[["city", "geodetic"]],
        geodetic="geodetic",
        latitude="latitude",
        longitude="longitude",
        altitude="altitude",
    )
    assert sorted(post_df.columns.tolist()) == sorted(
        ["city", "geodetic", "latitude", "longitude", "altitude"]
    )
    assert series_to_list(post_df["longitude"]) == series_to_list(
        lonlat_df["longitude"]
    )
    assert series_to_list(post_df["latitude"]) == series_to_list(lonlat_df["latitude"])
    assert series_to_list(post_df["altitude"]) == series_to_list(lonlat_df["altitude"])

    # parse geodetic string into lon/lat
    post_df = geodetic_parse(
        df=lonlat_df[["city", "geodetic"]],
        geodetic="geodetic",
        latitude="latitude",
        longitude="longitude",
    )
    assert sorted(post_df.columns.tolist()) == sorted(
        ["city", "geodetic", "latitude", "longitude"]
    )
    assert series_to_list(post_df["longitude"]) == series_to_list(
        lonlat_df["longitude"]
    )
    assert series_to_list(post_df["latitude"]), series_to_list(lonlat_df["latitude"])


def test_geohash_decode_empty_frame():
    post_df = geohash_decode(
        df=DataFrame({"geohash": []}),
        geohash="geohash",
        latitude="latitude",
        longitude="longitude",
    )

    assert len(post_df) == 0
    assert sorted(post_df.columns.tolist()) == ["geohash", "latitude", "longitude"]


def test_geohash_decode_invalid_geohash():
    with pytest.raises(InvalidPostProcessingError, match="Invalid geohash string"):
        geohash_decode(
            df=DataFrame({"geohash": ["s0!@"]}),
            geohash="geohash",
            latitude="latitude",
            longitude="longitude",
        )


def test_geohash_encode_empty_frame():
    post_df = geohash_encode(
        df=DataFrame({"latitude": [], "longitude": []}),
        geohash="geohash",
        latitude="latitude",
        longitude="longitude",
    )

    assert len(post_df) == 0
    assert sorted(post_df.columns.tolist()) == ["geohash", "latitude", "longitude"]


def test_geodetic_parse_empty_frame():
    df = DataFrame({"geodetic": []})
    with_altitude = geodetic_parse(
        df=df,
        geodetic="geodetic",
        latitude="latitude",
        longitude="longitude",
        altitude="altitude",
    )
    without_altitude = geodetic_parse(
        df=df,
        geodetic="geodetic",
        latitude="latitude",
        longitude="longitude",
    )

    assert len(with_altitude) == 0
    assert sorted(with_altitude.columns.tolist()) == [
        "altitude",
        "geodetic",
        "latitude",
        "longitude",
    ]
    assert len(without_altitude) == 0
    assert sorted(without_altitude.columns.tolist()) == [
        "geodetic",
        "latitude",
        "longitude",
    ]


def test_geodetic_parse_invalid_string():
    with pytest.raises(InvalidPostProcessingError, match="Invalid geodetic string"):
        geodetic_parse(
            df=DataFrame({"geodetic": ["not a point"]}),
            geodetic="geodetic",
            latitude="latitude",
            longitude="longitude",
        )

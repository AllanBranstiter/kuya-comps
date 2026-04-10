# backend/services/player_stats_service.py
"""
Player statistics service for the player collectibility component.

Loads FanGraphs batting and pitching CSVs, builds a name/MLBAM index,
and provides stat lookups and composite scoring for individual players.
"""
import math
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd

from backend.config import PLAYER_STATS_CSV_DIR, PLAYER_PROJECTIONS_DIR
from backend.logging_config import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Module-level cache (loaded once per process)
# ---------------------------------------------------------------------------

_batting_df: Optional[pd.DataFrame] = None
_pitching_df: Optional[pd.DataFrame] = None
_career_batting_df: Optional[pd.DataFrame] = None
_career_pitching_df: Optional[pd.DataFrame] = None
_adp_index: Optional[Dict[int, float]] = None  # MLBAMID -> ADP
_position_index: Optional[Dict[int, str]] = None  # MLBAMID -> position string
_name_index: Optional[Dict[str, dict]] = None


# ---------------------------------------------------------------------------
# CSV Column Constants
# ---------------------------------------------------------------------------

BATTING_COLS = [
    "NameASCII", "Team", "Season", "Age", "AB", "PA", "HR",
    "WAR", "wRC+", "wOBA",
    "O-Swing%", "Z-Swing%",
    "EV", "Barrel%", "HardHit%", "xwOBA",
    "PlayerId", "MLBAMID",
]

PITCHING_COLS = [
    "NameASCII", "Team", "Season", "Age", "IP", "ERA",
    "K/9", "BB/9", "WHIP", "FIP", "WAR",
    "PlayerId", "MLBAMID",
]

CAREER_BATTING_COLS = [
    "NameASCII", "Team", "AB", "PA", "HR", "WAR",
    "PlayerId", "MLBAMID",
]

CAREER_PITCHING_COLS = [
    "NameASCII", "Team", "IP", "ERA", "K/9", "WHIP", "WAR",
    "PlayerId", "MLBAMID",
]


# ---------------------------------------------------------------------------
# Stat Scoring Thresholds
# ---------------------------------------------------------------------------

# Batter metrics: (column, weight, elite_value, poor_value, inverted)
# Note: FanGraphs CSVs store percentages as 0-1 decimals
BATTER_METRICS = [
    ("xwOBA", 0.30, 0.400, 0.280, False),
    ("Barrel%", 0.25, 0.15, 0.03, False),     # 15% = 0.15
    ("EV", 0.20, 92.0, 85.0, False),           # mph, not a percentage
    ("HardHit%", 0.15, 0.50, 0.30, False),     # 50% = 0.50
    ("O-Swing%", 0.10, 0.22, 0.35, True),      # 22% = 0.22, lower is better
]

# Pitcher metrics: (column, weight, elite_value, poor_value, inverted)
PITCHER_METRICS = [
    ("K/9", 0.30, 12.0, 6.0, False),
    ("ERA", 0.25, 2.50, 5.00, True),           # lower is better
    ("WHIP", 0.20, 0.95, 1.50, True),          # lower is better
    ("WAR", 0.25, 6.0, 0.0, False),
]


# ---------------------------------------------------------------------------
# CSV Loading
# ---------------------------------------------------------------------------

def _find_csv(directory: str, pattern: str) -> Optional[Path]:
    """Find the most recent CSV matching a glob pattern in directory."""
    csv_dir = Path(directory)
    if not csv_dir.is_dir():
        return None
    matches = sorted(csv_dir.glob(pattern), key=os.path.getmtime, reverse=True)
    return matches[0] if matches else None


def _load_csv(path: Path, usecols: List[str]) -> Optional[pd.DataFrame]:
    """Load a FanGraphs CSV with only the requested columns."""
    try:
        df = pd.read_csv(path, encoding="utf-8-sig")
        # FanGraphs exports duplicate Name/Team in first columns; drop dupes
        df = df.loc[:, ~df.columns.duplicated()]
        available = [c for c in usecols if c in df.columns]
        missing = set(usecols) - set(available)
        if missing:
            logger.warning(f"[player_stats] Missing columns in {path.name}: {missing}")
        df = df[available].copy()
        # Coerce numeric columns
        for col in df.columns:
            if col not in ("NameASCII", "Team", "POS", "Pos", "Season"):
                df[col] = pd.to_numeric(df[col], errors="coerce")
        return df
    except Exception as e:
        logger.error(f"[player_stats] Failed to load {path}: {e}")
        return None


def load_stats() -> Tuple[
    Optional[pd.DataFrame],
    Optional[pd.DataFrame],
    Optional[pd.DataFrame],
    Optional[pd.DataFrame],
]:
    """
    Load and cache all FanGraphs CSVs.

    Returns (batting, pitching, career_batting, career_pitching).
    Any or all may be None if the files are missing.
    """
    global _batting_df, _pitching_df, _career_batting_df, _career_pitching_df

    if _batting_df is not None:
        return _batting_df, _pitching_df, _career_batting_df, _career_pitching_df

    csv_dir = PLAYER_STATS_CSV_DIR

    bat_path = _find_csv(csv_dir, "*_Regular_Season_Stats_Batting.csv")
    pit_path = _find_csv(csv_dir, "*_Regular_Season_Stats_Pitching.csv")
    car_bat_path = _find_csv(csv_dir, "Career_Regular_Season_Stats_Batting.csv")
    car_pit_path = _find_csv(csv_dir, "Career_Regular_Season_Stats_Pitching.csv")

    if bat_path:
        _batting_df = _load_csv(bat_path, BATTING_COLS)
        logger.info(
            f"[player_stats] Loaded {len(_batting_df)} batters from {bat_path.name}"
        )
    if pit_path:
        _pitching_df = _load_csv(pit_path, PITCHING_COLS)
        logger.info(
            f"[player_stats] Loaded {len(_pitching_df)} pitchers from {pit_path.name}"
        )
    if car_bat_path:
        _career_batting_df = _load_csv(car_bat_path, CAREER_BATTING_COLS)
        logger.info(
            f"[player_stats] Loaded {len(_career_batting_df)} career batters"
        )
    if car_pit_path:
        _career_pitching_df = _load_csv(car_pit_path, CAREER_PITCHING_COLS)
        logger.info(
            f"[player_stats] Loaded {len(_career_pitching_df)} career pitchers"
        )

    return _batting_df, _pitching_df, _career_batting_df, _career_pitching_df


# ---------------------------------------------------------------------------
# ADP (Average Draft Position) Loading
# ---------------------------------------------------------------------------

ADP_COLS = ["NameASCII", "POS", "ADP", "MLBAMID"]


def load_adp_index() -> Dict[int, float]:
    """
    Load ADP and position data from FanGraphs auction calculator CSVs.

    Returns a dict of MLBAMID -> ADP (lower ADP = more valuable player).
    Also populates _position_index (MLBAMID -> position string).
    Combines batter and pitcher ADP files.
    """
    global _adp_index, _position_index
    if _adp_index is not None:
        return _adp_index

    _adp_index = {}
    _position_index = {}
    proj_dir = Path(PLAYER_PROJECTIONS_DIR)

    for pattern in [
        "batters-fangraphs-auction-calculator.csv",
        "pitchers-fangraphs-auction-calculator.csv",
    ]:
        path = proj_dir / pattern
        if not path.is_file():
            logger.warning(f"[player_stats] ADP file not found: {path}")
            continue

        df = _load_csv(path, ADP_COLS)
        if df is None:
            continue

        for _, row in df.iterrows():
            mlbam_id = row.get("MLBAMID")
            adp = row.get("ADP")
            pos = row.get("POS")
            if pd.notna(mlbam_id):
                mid = int(mlbam_id)
                if pd.notna(adp) and adp > 0:
                    _adp_index[mid] = float(adp)
                if pd.notna(pos) and isinstance(pos, str) and pos.strip():
                    if mid not in _position_index:  # batter position wins
                        _position_index[mid] = pos.strip()

    logger.info(f"[player_stats] Loaded ADP data for {len(_adp_index)} players, {len(_position_index)} positions")
    return _adp_index


def get_player_adp(mlbam_id: int) -> Optional[float]:
    """Get ADP for a player by MLBAM ID. Returns None if not found."""
    index = load_adp_index()
    return index.get(mlbam_id)


def get_player_position(mlbam_id: int) -> Optional[str]:
    """Get text position for a player by MLBAM ID (e.g., 'SS', 'OF/DH')."""
    load_adp_index()  # ensures _position_index is populated
    return _position_index.get(mlbam_id) if _position_index else None


# ---------------------------------------------------------------------------
# Name Index (for player identification fuzzy matching)
# ---------------------------------------------------------------------------

def build_name_index() -> Dict[str, dict]:
    """
    Build a lookup of normalized player names to their metadata.

    Returns a dict keyed by lowercased NameASCII mapping to:
        {"name": str, "mlbam_id": int, "team": str, "position": str, "is_pitcher": bool}
    """
    global _name_index
    if _name_index is not None:
        return _name_index

    batting, pitching, career_bat, career_pit = load_stats()
    load_adp_index()  # ensures _position_index is populated
    _name_index = {}

    # Process batters first (higher collectibility, take priority on conflicts)
    for df, is_pitcher in [
        (batting, False),
        (pitching, True),
        (career_bat, False),
        (career_pit, True),
    ]:
        if df is None:
            continue
        for _, row in df.iterrows():
            name = row.get("NameASCII")
            mlbam_id = row.get("MLBAMID")
            if pd.isna(name) or pd.isna(mlbam_id):
                continue
            key = str(name).strip().lower()
            if key in _name_index:
                continue  # keep first (current season batter data wins)
            mid = int(mlbam_id)
            # Get position from auction calculator (text), not season stats (numeric)
            pos = (_position_index or {}).get(mid, "SP" if is_pitcher else "")
            _name_index[key] = {
                "name": str(name).strip(),
                "mlbam_id": mid,
                "team": str(row.get("Team", "")).strip(),
                "position": pos,
                "is_pitcher": is_pitcher,
            }

    logger.info(f"[player_stats] Name index built with {len(_name_index)} players")
    return _name_index


# ---------------------------------------------------------------------------
# Player Lookups
# ---------------------------------------------------------------------------

def get_player_season_stats(mlbam_id: int) -> Optional[dict]:
    """
    Get current season stats for a player by MLBAM ID.

    Returns a dict of stat values, or None if not found.
    """
    batting, pitching, _, _ = load_stats()

    # Check batting first
    if batting is not None:
        match = batting[batting["MLBAMID"] == mlbam_id]
        if not match.empty:
            row = match.iloc[0]
            return {
                "is_pitcher": False,
                **{col: row[col] for col in match.columns if col in row.index and pd.notna(row[col])},
            }

    # Check pitching
    if pitching is not None:
        match = pitching[pitching["MLBAMID"] == mlbam_id]
        if not match.empty:
            row = match.iloc[0]
            return {
                "is_pitcher": True,
                **{col: row[col] for col in match.columns if col in row.index and pd.notna(row[col])},
            }

    return None


def get_player_career_stats(mlbam_id: int) -> Optional[dict]:
    """
    Get career aggregate stats for a player by MLBAM ID.

    Returns a dict with career PA (or IP), WAR, position, etc.
    """
    _, _, career_bat, career_pit = load_stats()

    if career_bat is not None:
        match = career_bat[career_bat["MLBAMID"] == mlbam_id]
        if not match.empty:
            row = match.iloc[0]
            return {
                "is_pitcher": False,
                "career_pa": row.get("PA", 0) if pd.notna(row.get("PA")) else 0,
                "career_ab": row.get("AB", 0) if pd.notna(row.get("AB")) else 0,
                "career_war": row.get("WAR", 0) if pd.notna(row.get("WAR")) else 0,
            }

    if career_pit is not None:
        match = career_pit[career_pit["MLBAMID"] == mlbam_id]
        if not match.empty:
            row = match.iloc[0]
            return {
                "is_pitcher": True,
                "career_ip": row.get("IP", 0) if pd.notna(row.get("IP")) else 0,
                "career_war": row.get("WAR", 0) if pd.notna(row.get("WAR")) else 0,
                "position": "",
            }

    return None


# ---------------------------------------------------------------------------
# Stat Composite Scoring
# ---------------------------------------------------------------------------

def _interpolate(value: float, elite: float, poor: float, inverted: bool) -> float:
    """Linearly interpolate a stat value between poor (0.0) and elite (1.0)."""
    if inverted:
        # Lower is better: poor is the high number, elite is the low number
        if value <= elite:
            return 1.0
        if value >= poor:
            return 0.0
        return (poor - value) / (poor - elite)
    else:
        if value >= elite:
            return 1.0
        if value <= poor:
            return 0.0
        return (value - poor) / (elite - poor)


def score_batter_stats(stats: dict) -> float:
    """
    Compute a 0.0-1.0 composite score for a batter's underlying statistics.

    Uses xwOBA, Barrel%, EV, HardHit%, O-Swing% with weights from BATTER_METRICS.
    """
    total_weight = 0.0
    weighted_sum = 0.0

    for col, weight, elite, poor, inverted in BATTER_METRICS:
        value = stats.get(col)
        if value is None or (isinstance(value, float) and math.isnan(value)):
            continue
        weighted_sum += weight * _interpolate(float(value), elite, poor, inverted)
        total_weight += weight

    if total_weight == 0:
        return 0.3  # neutral fallback

    return weighted_sum / total_weight


def score_pitcher_stats(stats: dict) -> float:
    """
    Compute a 0.0-1.0 composite score for a pitcher's underlying statistics.

    Uses K/9, ERA, WHIP, WAR with weights from PITCHER_METRICS.
    """
    total_weight = 0.0
    weighted_sum = 0.0

    for col, weight, elite, poor, inverted in PITCHER_METRICS:
        value = stats.get(col)
        if value is None or (isinstance(value, float) and math.isnan(value)):
            continue
        weighted_sum += weight * _interpolate(float(value), elite, poor, inverted)
        total_weight += weight

    if total_weight == 0:
        return 0.3  # neutral fallback

    return weighted_sum / total_weight


def score_statistics(mlbam_id: int) -> Tuple[float, bool]:
    """
    Score a player's underlying statistics (0.0-1.0).

    Returns (score, is_pitcher). Falls back to 0.3 if no data found.
    """
    stats = get_player_season_stats(mlbam_id)
    if stats is None:
        return 0.3, False

    is_pitcher = stats.get("is_pitcher", False)
    if is_pitcher:
        return score_pitcher_stats(stats), True
    return score_batter_stats(stats), False

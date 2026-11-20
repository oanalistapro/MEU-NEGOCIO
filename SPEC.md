
project: BUSINESS_PRO
version: V24

development:
  mode: specification_driven
  preserve_existing_code: true
  minimal_changes: true

protection:
  production_v23: read_only
  preserve_user_data: true
  preserve_firebase: true
  preserve_original_assets: true

interface:
  welcome:
    animation: cinematic_unique
    typography: distinctive

  internal_cards:
    animation: bottom_to_top
    rotation: false

  photo_cards:
    animation: curved_3d
    rotation_360: false

quality:
  validate_syntax: true
  run_regression_tests: true
  validate_mobile: true
  validate_desktop: true

delivery:
  complete_index_html: true
  report_test_results: true

"""Backward-compatible entry point for the split Kaggle model workflow."""

# Member B starts here: preserve the original training command for existing users.
from train_and_evaluate import main


if __name__ == "__main__":
    main()

import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not set in environment');
    }

    await mongoose.connect(uri);
    console.log('MongoDB connected');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('MongoDB connection error:', msg);
    process.exit(1);
  }
};

export default connectDB;


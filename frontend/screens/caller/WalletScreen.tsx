import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { walletApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import type { CallerStackParamList } from '../../navigation/CallerStackParamList';
import type { WalletOfferRow } from '../../types/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PURPLE = '#7b2cff';
const GST_PERCENTAGE = 28;

type Props = NativeStackScreenProps<CallerStackParamList, 'Wallet'>;

const WALLET_OFFER_BANNER_KEY = '@nesthama_wallet_offer_banner_seen';

export default function WalletScreen({ navigation }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [selected, setSelected] = useState<WalletOfferRow | null>(null);
  const [offers, setOffers] = useState<WalletOfferRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [bannerImage, setBannerImage] = useState<string | null>(null);
  const [bannerOpen, setBannerOpen] = useState(false);

  const bal = typeof user?.walletBalance === 'number' && Number.isFinite(user.walletBalance) ? user.walletBalance : 0;

  // Calculate credit directly without static function
  const calculateCredit = (amount: number, bonusPercent: number): number => {
    // amount from API is the base amount (without GST)
    const totalCredit = amount * (1 + bonusPercent / 100);
    return Math.round(totalCredit * 100) / 100;
  };

  const onProceed = () => {
    if (!selected) {
      Alert.alert('Select amount', 'Choose a recharge pack to continue.');
      return;
    }
    
    const credit = calculateCredit(selected.amount, selected.bonusPercent);
    const walletAmount = selected.amount;
    const gstAmount = (selected.amount * GST_PERCENTAGE) / 100;
    const totalAmount = selected.amount + gstAmount;
    
    navigation.navigate('PaymentMethod', {
      walletAmount: walletAmount,
      payAmount: totalAmount,
      gstAmount: gstAmount,
      totalAmount: totalAmount,
      bonusPercent: selected.bonusPercent,
      creditAmount: credit,
    });
  };

  const renderPkg = ({ item }: { item: WalletOfferRow }) => {
    const active = selected?.id === item.id;
    const credit = calculateCredit(item.amount, item.bonusPercent);
    return (
      <TouchableOpacity
        style={[styles.pkg, active && styles.pkgActive]}
        onPress={() => setSelected(item)}
        activeOpacity={0.9}
      >
        {item.popular ? (
          <View style={styles.popular}>
            <Text style={styles.popularTxt}>Popular</Text>
          </View>
        ) : null}
        <Text style={styles.pkgPay}>₹ {item.amount}</Text>
        <Text style={styles.pkgBonus}>+{item.bonusPercent}% Extra</Text>
        <Text style={styles.pkgCredit}>Credit ₹{credit.toLocaleString('en-IN')}</Text>
      </TouchableOpacity>
    );
  };

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        console.log('🔍 Fetching wallet offers...');
        
        const { data } = await walletApi.offers();
        console.log('📦 API Response:', JSON.stringify(data, null, 2));
        
        if (!mounted) return;
        
        setOffers(data.offers ?? []);
        
        // Get banner from the response
        if (data.banner?.imageDataUrl) {
          console.log('✅ Banner URL found:', data.banner.imageDataUrl);
          setBannerImage(data.banner.imageDataUrl);
          
          // FORCE OPEN BANNER FOR TESTING - REMOVE IN PRODUCTION
          console.log('🎉 FORCE OPENING BANNER');
          setBannerOpen(true);
          
          // Original logic (commented for testing)
          // const seen = await AsyncStorage.getItem(WALLET_OFFER_BANNER_KEY);
          // console.log('💾 Storage value:', seen);
          // if (seen !== 'true') {
          //   console.log('🎉 Showing banner');
          //   setBannerOpen(true);
          // }
        } else {
          console.log('❌ No banner in API response');
          console.log('   Check: popular offer with offerBannerDataUrl exists?');
        }
      } catch (e) {
        console.error('❌ Error:', e);
        if (!mounted) return;
        setOffers([]);
        setBannerImage(null);
      } finally {
        if (mounted) {
          setLoading(false);
          console.log('🏁 Loading complete, bannerOpen:', bannerOpen);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const closeBanner = async () => {
    console.log('🔒 Closing banner');
    setBannerOpen(false);
    await AsyncStorage.setItem(WALLET_OFFER_BANNER_KEY, 'true');
    console.log('✅ Banner closed and saved to storage');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 16) + 18,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Popup */}
        {bannerOpen && bannerImage ? (
          <View style={styles.bannerOverlay}>
            <View style={styles.bannerPopup}>
              <TouchableOpacity style={styles.bannerClose} onPress={closeBanner}>
                <Text style={styles.bannerCloseText}>✕</Text>
              </TouchableOpacity>
              <Image 
                source={{ uri: bannerImage }} 
                style={styles.bannerImage}
                resizeMode="cover"
                onError={() => console.log('❌ Image failed to load')}
                onLoad={() => console.log('✅ Image loaded successfully')}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backWrapper}>
  <Ionicons name="chevron-back" size={24}  />
</TouchableOpacity>
          <Text style={styles.title}>Wallet</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => navigation.navigate('WalletTransactions')}>
              <Text style={styles.txLink}>View Transactions</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLbl}>My Balance</Text>
          <Text style={styles.balanceAmt}>₹ {bal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
        </View>

        <Text style={styles.section}>Add Balance to Wallet</Text>
        <View>
          {offers && offers.length > 0
            ? Array.from({ length: Math.ceil(offers.length / 2) }, (_, row) => (
            <View key={row} style={styles.row}>
              {offers.slice(row * 2, row * 2 + 2).map((p) => (
                <View key={`${p.amount}-${p.bonusPercent}`} style={styles.pkgCell}>
                  {renderPkg({ item: p })}
                </View>
              ))}
              {offers.slice(row * 2, row * 2 + 2).length === 1 ? <View style={styles.pkgCell} /> : null}
            </View>
          ))
            : !loading && (
              <Text style={{ textAlign: 'center', color: '#888', marginTop: 20 }}>
                No offers available
              </Text>
            )}
        </View>

        <View style={styles.secureRow}>
          <Text style={styles.lock}>🔒</Text>
          <Text style={styles.secureTxt}>100% Secure Payment</Text>
        </View>

        <TouchableOpacity style={styles.cta} onPress={onProceed} activeOpacity={0.9}>
          <Text style={styles.ctaTxt}>Proceed to Pay</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f7' },
  content: { flexGrow: 1, paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  back: { padding: 6 },
  backTxt: { fontSize: 22 },
  title: { fontSize: 18, fontWeight: '900', color: '#111' },
  txLink: { fontSize: 12, fontWeight: '800', color: PURPLE },
  balanceCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 20,
  },
  balanceLbl: { fontSize: 12, color: '#666', fontWeight: '700', marginBottom: 6 },
  balanceAmt: { fontSize: 28, fontWeight: '900', color: '#111' },
  section: { fontSize: 15, fontWeight: '900', color: '#111', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  pkgCell: { flex: 1, minWidth: 0 },
  pkg: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    minHeight: 100,
  },
  pkgActive: { borderColor: PURPLE, borderWidth: 2, backgroundColor: 'rgba(123,44,255,0.06)' },
  popular: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#dc2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  popularTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },
  pkgPay: { fontSize: 18, fontWeight: '900', color: '#111', marginTop: 8 },
  pkgBonus: { fontSize: 12, color: PURPLE, fontWeight: '800', marginTop: 4 },
  pkgCredit: { fontSize: 11, color: '#888', marginTop: 8, fontWeight: '600' },
  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
  lock: { fontSize: 16 },
  secureTxt: { fontSize: 12, color: '#666', fontWeight: '700' },
  cta: {
    marginTop: 'auto',
    marginBottom: 0,
    backgroundColor: PURPLE,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
  
  // Banner Popup Styles
  bannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerPopup: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  bannerClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10000,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerCloseText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  bannerImage: {
    width: '100%',
    height: 200,
  },
  bannerButton: {
    backgroundColor: PURPLE,
    paddingVertical: 12,
    alignItems: 'center',
    margin: 16,
    borderRadius: 10,
  },
  backWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF0FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});